
from mido import MidiFile
import sys
from pathlib import Path
import os
from dotenv import load_dotenv
from openai import OpenAI
import logging
import re

# Logging konfigurieren
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Umgebungsvariablen laden
load_dotenv()

TRACK_NAME = "SysEx-Daten"  # Name der Spur, aus der der Text kommt
TIME_THRESHOLD = 0.5  # Sekunden - Silben näher zusammen werden gruppiert
USE_LLM = os.getenv("USE_LLM_CORRECTION", "false").lower() == "true"
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
OPENAI_MODEL = os.getenv("OPENAI_MODEL", "gpt-4o-mini")

def build_tempo_map(mid: MidiFile):
    """
    Liefert eine Liste von (tick_position, tempo_in_us_per_beat)
    sortiert nach Tick. Default: 500000 µs pro Beat (120 BPM).
    """
    ticks_per_beat = mid.ticks_per_beat
    tempo_events = [(0, 500000)]  # Default-Tempo

    abs_tick = 0
    for track in mid.tracks:
        abs_tick = 0
        for msg in track:
            abs_tick += msg.time
            if msg.type == "set_tempo":
                tempo_events.append((abs_tick, msg.tempo))

    # Nach Tick sortieren und evtl. doppelte entfernen
    tempo_events.sort(key=lambda x: x[0])
    cleaned = []
    last_tick = -1
    for t, tempo in tempo_events:
        if t != last_tick:
            cleaned.append((t, tempo))
            last_tick = t
        else:
            cleaned[-1] = (t, tempo)

    return cleaned, ticks_per_beat


def ticks_to_seconds(tick, tempo_map, ticks_per_beat):
    """
    Rechnet einen absoluten Tick-Wert in Sekunden um, basierend auf tempo_map.
    tempo_map: Liste (tick_position, tempo_in_us_per_beat)
    """
    seconds = 0.0
    last_tick = 0
    last_tempo = tempo_map[0][1]

    for i in range(1, len(tempo_map)):
        tempo_tick, tempo = tempo_map[i]
        if tick <= tempo_tick:
            # Unser Ziel-Tick liegt in diesem Segment
            delta_ticks = tick - last_tick
            seconds += (delta_ticks / ticks_per_beat) * (last_tempo / 1_000_000.0)
            return seconds
        else:
            # komplettes Segment durchlaufen
            delta_ticks = tempo_tick - last_tick
            seconds += (delta_ticks / ticks_per_beat) * (last_tempo / 1_000_000.0)
            last_tick = tempo_tick
            last_tempo = tempo

    # falls Tick hinter dem letzten Tempo-Event liegt
    delta_ticks = tick - last_tick
    seconds += (delta_ticks / ticks_per_beat) * (last_tempo / 1_000_000.0)
    return seconds


def is_control_character(text):
    """
    Prüft, ob Text nur Steuerzeichen oder unerwünschte Zeichen enthält.
    """
    if not text or not text.strip():
        return True
    
    cleaned = text.strip()
    
    # Filter für "---" Trennzeichen (oft am Anfang/Ende)
    if cleaned.startswith('---') or cleaned == '---':
        return True
    
    # Filter für typische MIDI-Steuerzeichen - alle Varianten
    control_prefixes = ['CL', 'CsP', 'C@', 'CLX', 'CLZ', 'CP']
    for prefix in control_prefixes:
        if cleaned.startswith(prefix):
            # Entferne Präfix und schaue was übrig bleibt
            rest = cleaned[len(prefix):]
            # Wenn nach dem Präfix keine Buchstaben oder Ziffern sind, ist es ein Steuerzeichen
            has_alphanumeric = any(c.isalnum() for c in rest)
            if not has_alphanumeric:
                return True
    
    return False


def extract_lyrics_from_track(track, tempo_map, ticks_per_beat):
    """
    Extrahiert Text aus einer Spur:
    - MIDI Meta: lyrics, text
    - SysEx: versucht ASCII-Text zu dekodieren
    Gibt Liste von (seconds, text) zurück.
    """
    events = []
    abs_tick = 0

    for msg in track:
        abs_tick += msg.time

        text = None

        if msg.type in ("lyrics", "text"):
            text = msg.text

        elif msg.type == "sysex":
            # Versuch: SysEx-Daten als Text interpretieren
            # ggf. Header abschneiden -> hier kannst du anpassen
            raw = bytes(msg.data)
            try:
                decoded = raw.decode("latin1", errors="ignore").strip()
                if decoded:
                    text = decoded
            except Exception:
                pass

        if text and not is_control_character(text):
            t_sec = ticks_to_seconds(abs_tick, tempo_map, ticks_per_beat)
            events.append((t_sec, text))

    return events


def format_lrc_time(seconds: float) -> str:
    m = int(seconds // 60)
    s = int(seconds % 60)
    hs = int(round((seconds - int(seconds)) * 100))  # Hundertstel
    if hs == 100:
        # Rundungs-Korrektur
        hs = 0
        s += 1
        if s == 60:
            s = 0
            m += 1
    return f"[{m:02d}:{s:02d}.{hs:02d}]"


def group_syllables_by_time(events, threshold=TIME_THRESHOLD):
    """
    Gruppiert Silben, die zeitlich nah beieinander liegen.
    
    Args:
        events: Liste von (time, text) Tupeln
        threshold: Maximale Zeitdifferenz in Sekunden für Gruppierung
    
    Returns:
        Liste von (time, grouped_text) Tupeln
    """
    if not events:
        return []
    
    grouped = []
    current_group = [events[0]]
    current_time = events[0][0]
    
    logger.info(f"Starte Silben-Gruppierung mit Schwellenwert {threshold}s")
    original_count = len(events)
    
    for i in range(1, len(events)):
        time, text = events[i]
        
        if not text or not text.strip():
            continue
        
        time_diff = time - current_group[-1][0]
        prev_text = current_group[-1][1].strip()
        
        # Prüfe ob diese Events zusammen gehören
        should_group = False
        
        # 1. Grundregel: zeitlich nah beieinander
        if time_diff < threshold:
            # 2. Nicht gruppieren, wenn vorheriger Text mit Satzzeichen endet (außer Komma/Bindestrich)
            if prev_text.endswith(('.', '!', '?')):
                should_group = False
            # 3. Nicht gruppieren, wenn aktueller Text mit Großbuchstabe beginnt (neuer Vers/Satz)
            elif text[0].isupper() and prev_text and prev_text[-1] in '.!?':
                should_group = False
            else:
                # Standard: gruppiere wenn zeitlich nah
                should_group = True
        
        if should_group:
            current_group.append((time, text))
        else:
            # Gruppe abschließen - direkt concatenieren, nicht mit Leerzeichen!
            combined_text = ''.join([t for _, t in current_group])
            if combined_text.strip():
                grouped.append((current_time, combined_text))
            
            # Neue Gruppe starten
            current_group = [(time, text)]
            current_time = time
    
    # Letzte Gruppe hinzufügen
    if current_group:
        combined_text = ''.join([t for _, t in current_group])
        if combined_text.strip():
            grouped.append((current_time, combined_text))
    
    grouped_count = len(grouped)
    reduction = ((original_count - grouped_count) / original_count * 100) if original_count > 0 else 0
    logger.info(f"Silben-Gruppierung abgeschlossen: {original_count} → {grouped_count} Einträge ({reduction:.1f}% Reduktion)")
    
    return grouped


def correct_with_llm(events):
    """
    Verwendet OpenAI API um Liedtexte intelligenter zusammenzufassen.
    
    Args:
        events: Liste von (time, text) Tupeln
    
    Returns:
        Liste von (time, corrected_text) Tupeln
    """
    if not OPENAI_API_KEY:
        logger.warning("OpenAI API Key nicht gefunden. Überspringe LLM-Korrektur.")
        return events
    
    try:
        logger.info(f"Starte LLM-Korrektur mit Modell: {OPENAI_MODEL}")
        
        # Lade Prompt-Template
        prompt_path = Path(__file__).parent / "prompts" / "syllable_merger.txt"
        with open(prompt_path, "r", encoding="utf-8") as f:
            prompt_template = f.read()
        
        # Erstelle Input-Text mit LRC-Format (mit Timecodes)
        input_text = "\n".join([f"{format_lrc_time(time)}{text.strip()}" for time, text in events if text.strip()])
        
        logger.info(f"Sende {len(events)} Einträge an OpenAI...")
        logger.debug(f"Input-Text (erste 300 Zeichen):\n{input_text[:300]}...")
        
        client = OpenAI(api_key=OPENAI_API_KEY)
        
        response = client.chat.completions.create(
            model=OPENAI_MODEL,
            messages=[
                {"role": "system", "content": prompt_template},
                {"role": "user", "content": input_text}
            ],
            temperature=0.3,
            max_tokens=4000
        )
        
        corrected_text = response.choices[0].message.content.strip()
        logger.info(f"LLM-Antwort erhalten. Tokens verwendet: {response.usage.total_tokens}")
        logger.debug(f"Korrigierter Text (erste 300 Zeichen):\n{corrected_text[:300]}...")
        
        # Parse die LRC-Ausgabe - Trennung mit "|"
        corrected_lines = [line.strip() for line in corrected_text.split("|") if line.strip()]
        
        # Parse jede Zeile um Timecode und Text zu extrahieren
        result = []
        for line in corrected_lines:
            # Format: [MM:SS.HH]text
            match = re.match(r'\[(\d{2}):(\d{2})\.(\d{2})\](.*)', line)
            if match:
                m, s, hs, text = match.groups()
                time_seconds = int(m) * 60 + int(s) + int(hs) / 100.0
                result.append((time_seconds, text.strip()))
            else:
                logger.warning(f"Konnte Zeile nicht parsen: {line}")
        
        if result:
            logger.info(f"LLM-Korrektur abgeschlossen: {len(events)} → {len(result)} Einträge")
            return result
        else:
            logger.warning("LLM-Parsing fehlgeschlagen, nutze Original")
            return events
        
    except FileNotFoundError:
        logger.error(f"Prompt-Datei nicht gefunden: {prompt_path}")
        return events
    except Exception as e:
        logger.error(f"Fehler bei LLM-Korrektur: {str(e)}")
        return events


def midi_to_lrc(midi_path: Path, lrc_path: Path):
    logger.info(f"Starte Konvertierung: {midi_path} → {lrc_path}")
    
    mid = MidiFile(midi_path)
    tempo_map, ticks_per_beat = build_tempo_map(mid)
    logger.info(f"MIDI geladen: {len(mid.tracks)} Spuren, {ticks_per_beat} ticks/beat")

    # Spur mit Namen "SysEx-Daten" finden
    target_track = None
    for track in mid.tracks:
        for msg in track:
            if msg.type == "track_name" and msg.name == TRACK_NAME:
                target_track = track
                logger.info(f"Zielspur '{TRACK_NAME}' gefunden")
                break
        if target_track:
            break

    if target_track is None:
        raise ValueError(f"Keine Spur mit Namen '{TRACK_NAME}' gefunden.")

    events = extract_lyrics_from_track(target_track, tempo_map, ticks_per_beat)
    logger.info(f"Text-Events extrahiert: {len(events)} Einträge")

    # Nach Zeit sortieren
    events.sort(key=lambda x: x[0])
    
    # Schritt 1: Zeitbasierte Gruppierung
    logger.info("=" * 60)
    logger.info("SCHRITT 1: Zeitbasierte Silben-Gruppierung")
    logger.info("=" * 60)
    events = group_syllables_by_time(events, TIME_THRESHOLD)
    
    # Schritt 2: Optional LLM-Korrektur
    if USE_LLM:
        logger.info("=" * 60)
        logger.info("SCHRITT 2: LLM-basierte Korrektur")
        logger.info("=" * 60)
        events = correct_with_llm(events)
    else:
        logger.info("LLM-Korrektur deaktiviert (USE_LLM_CORRECTION=false)")
    
    # Filtere Steuerzeichen und bereite Events für die Ausgabe vor
    logger.info("=" * 60)
    logger.info("Filtere Steuerzeichen...")
    
    # Finde den Index des ersten sinnvollen Textes
    first_real_text_idx = 0
    control_prefixes = ['CL', 'CsP', 'C@', 'CLX', 'CLZ', 'CP']
    
    def is_real_text(text):
        """Prüft ob Text echte Wörter/Lyrics enthält"""
        clean = text.strip()
        
        # Zu kurz = kein echter Text
        if len(clean) < 2:
            return False
        
        # Beginnt mit "---" = Steuerzeichen
        if clean.startswith('---'):
            return False
        
        # Beginnt mit Control-Präfix = Steuerzeichen (egal was danach kommt)
        for prefix in control_prefixes:
            if clean.startswith(prefix):
                # Auch wenn danach Text folgt - wenn zu viele Präfixe, sind es Steuerzeichen
                # Zähle wie oft der Präfix vorkommt
                if clean.count(prefix) >= 2:
                    return False
        
        # Prüfe ob Text nur aus kurzen Fragmenten besteht (Steuerzeichen)
        # z.B. "CL CsP CL @" sind nur 1-3 Zeichen pro Fragment
        import re
        fragments = re.split(r'[\s\-\~@]+', clean)
        short_fragments = [f for f in fragments if f and len(f) <= 3]
        long_fragments = [f for f in fragments if f and len(f) > 3]
        
        # Wenn 80%+ kurze Fragmente und wenige lange = Steuerzeichen
        if len(short_fragments) > 0 and len(long_fragments) == 0:
            return False
        
        # Enthält mindestens 1 Wort mit 4+ Zeichen UND Kleinbuchstaben = echter Text
        has_real_word = any(len(f) >= 4 and any(c.islower() for c in f) for f in fragments)
        if has_real_word:
            return True
        
        # Enthält mehrere Wörter mit Kleinbuchstaben = echter Text (z.B. "der Sonne")
        lowercase_count = sum(1 for c in clean if c.islower())
        if lowercase_count >= 3 and ' ' in clean:
            return True
        
        return False
    
    for i, (_, text) in enumerate(events):
        if is_real_text(text):
            first_real_text_idx = i
            logger.info(f"Erster echter Text bei Index {i}: '{text.strip()[:50]}...'")
            break
    
    # Nur Events ab dem ersten echten Text behalten
    filtered_events = events[first_real_text_idx:]
    logger.info(f"Steuerzeichen gefiltert: {len(events)} → {len(filtered_events)} Einträge")
    
    # LRC-Datei schreiben
    logger.info("=" * 60)
    logger.info("Schreibe LRC-Datei...")
    written_lines = 0
    with open(lrc_path, "w", encoding="utf-8") as f:
        for t_sec, text in filtered_events:
            # Überspringe leere oder nur aus Whitespace bestehende Texte
            if not text or not text.strip():
                continue
            
            # Entferne Zeilenumbrüche aus dem Text - jede Zeile muss einen Timecode haben
            # Ersetze Zeilenumbrüche durch Leerzeichen
            clean_text = text.replace('\n', ' ').replace('\r', ' ')
            # Entferne mehrfache Leerzeichen
            clean_text = ' '.join(clean_text.split())
            
            if not clean_text:
                continue
            
            timestamp = format_lrc_time(t_sec)
            f.write(f"{timestamp}{clean_text}\n")
            written_lines += 1

    logger.info(f"✅ Fertig! LRC gespeichert als: {lrc_path}")
    logger.info(f"Finale Anzahl Zeilen: {written_lines}")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        print("Verwendung: python midi_sysex_to_lrc.py input.mid output.lrc")
        sys.exit(1)

    midi_file = Path(sys.argv[1])
    lrc_file = Path(sys.argv[2])
    midi_to_lrc(midi_file, lrc_file)
