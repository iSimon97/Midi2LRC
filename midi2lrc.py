
from mido import MidiFile
import sys
from pathlib import Path

TRACK_NAME = "SysEx-Daten"  # Name der Spur, aus der der Text kommt

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

        if text:
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


def midi_to_lrc(midi_path: Path, lrc_path: Path):
    mid = MidiFile(midi_path)
    tempo_map, ticks_per_beat = build_tempo_map(mid)

    # Spur mit Namen "SysEx-Daten" finden
    target_track = None
    for track in mid.tracks:
        for msg in track:
            if msg.type == "track_name" and msg.name == TRACK_NAME:
                target_track = track
                break
        if target_track:
            break

    if target_track is None:
        raise ValueError(f"Keine Spur mit Namen '{TRACK_NAME}' gefunden.")

    events = extract_lyrics_from_track(target_track, tempo_map, ticks_per_beat)

    # Nach Zeit sortieren
    events.sort(key=lambda x: x[0])

    with open(lrc_path, "w", encoding="utf-8") as f:
        for t_sec, text in events:
            timestamp = format_lrc_time(t_sec)
            f.write(f"{timestamp}{text}\n")

    print(f"Fertig. LRC gespeichert als: {lrc_path}")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        print("Verwendung: python midi_sysex_to_lrc.py input.mid output.lrc")
        sys.exit(1)

    midi_file = Path(sys.argv[1])
    lrc_file = Path(sys.argv[2])
    midi_to_lrc(midi_file, lrc_file)
