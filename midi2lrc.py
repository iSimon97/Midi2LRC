import mido
import sys


def ticks_to_lrc_time(ticks, ticks_per_beat, tempo=500000):
    """Konvertiert MIDI-Ticks in LRC-Zeitformat [mm:ss.xx]"""
    seconds = mido.tick2second(ticks, ticks_per_beat, tempo)
    minutes = int(seconds // 60)
    secs = seconds % 60
    return f"[{minutes:02d}:{secs:05.2f}]"


def midi_to_lrc(input_file, output_file):
    """Konvertiert MIDI-Lyrics zu LRC-Format"""
    midi = mido.MidiFile(input_file)
    lrc_lines = []
    
    # Finde den Lyrics-Track (typischerweise "SysEx-Daten")
    lyrics_track = None
    for track in midi.tracks:
        for msg in track:
            if msg.type == 'lyrics':
                lyrics_track = track
                break
        if lyrics_track:
            break
    
    if not lyrics_track:
        print("Keine Lyrics im MIDI-File gefunden!")
        return
    
    # Finde Tempo-Events für korrekte Zeitberechnung
    tempo = 500000  # Default: 120 BPM
    for track in midi.tracks:
        for msg in track:
            if msg.type == 'set_tempo':
                tempo = msg.tempo
                break
    
    # Verarbeite Lyrics
    abs_time = 0
    current_line = ""
    line_start_time = None
    
    for msg in lyrics_track:
        abs_time += msg.time
        
        if msg.type == 'lyrics':
            text = msg.text
            
            # Überspringe Platzhalter und Metadaten
            if text.startswith('---') or text.startswith('(c)') or ':' in text:
                continue
            
            # Zeilenumbruch erkannt
            if text == '\r' or text.endswith('\r'):
                if text != '\r':
                    # Text vor dem \r hinzufügen
                    if line_start_time is None:
                        line_start_time = abs_time
                    current_line += text.rstrip('\r').rstrip()
                
                # Zeile speichern, wenn Inhalt vorhanden
                if current_line.strip():
                    timecode = ticks_to_lrc_time(line_start_time, midi.ticks_per_beat, tempo)
                    lrc_lines.append(f"{timecode} {current_line.strip()}")
                
                current_line = ""
                line_start_time = None
            else:
                # Startzeit der Zeile merken
                if line_start_time is None:
                    line_start_time = abs_time
                
                # Silbe/Wort hinzufügen
                current_line += text
    
    # Letzte Zeile (falls keine \r am Ende)
    if current_line.strip():
        timecode = ticks_to_lrc_time(line_start_time, midi.ticks_per_beat, tempo)
        lrc_lines.append(f"{timecode} {current_line.strip()}")
    
    # LRC-Datei schreiben
    with open(output_file, 'w', encoding='utf-8') as f:
        for line in lrc_lines:
            f.write(line + '\n')
    
    print(f"Erfolgreich {len(lrc_lines)} Zeilen nach {output_file} geschrieben.")


if __name__ == '__main__':
    if len(sys.argv) != 3:
        print('Usage: python midi2lrc.py <input_file.mid> <output_file.lrc>')
        sys.exit(1)
    midi_to_lrc(sys.argv[1], sys.argv[2])