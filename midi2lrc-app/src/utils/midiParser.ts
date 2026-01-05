/**
 * MIDI to LRC Parser
 * Konvertiert MIDI-Dateien mit eingebetteten Lyrics ins LRC-Format
 */

export interface LrcLine {
  time: number;
  text: string;
}

export interface MidiTrackInfo {
  index: number;
  name: string;
  hasLyrics: boolean;
  lyricsCount: number;
}

interface MidiEvent {
  deltaTime: number;
  type: number;
  metaType?: number;
  data?: number[];
}

interface MidiTrack {
  events: MidiEvent[];
  name: string;
}

interface TempoEvent {
  tick: number;
  tempo: number; // in microseconds per beat
}

interface ParsedMidiFile {
  header: {
    format: number;
    numTracks: number;
    ticksPerBeat: number;
  };
  tracks: MidiTrack[];
  tempo: number; // erstes/initiales Tempo
  tempoEvents: TempoEvent[]; // alle Tempo-Changes
}

// Globaler Cache für die geparste MIDI-Datei
let cachedMidiFile: ParsedMidiFile | null = null;

function readString(view: DataView, offset: number, length: number): string {
  let str = "";
  for (let i = 0; i < length; i++) {
    str += String.fromCharCode(view.getUint8(offset + i));
  }
  return str;
}

function readVariableLength(view: DataView, offset: number): { value: number; bytesRead: number } {
  let value = 0;
  let bytesRead = 0;
  let byte: number;

  do {
    byte = view.getUint8(offset + bytesRead);
    value = (value << 7) | (byte & 0x7f);
    bytesRead++;
  } while (byte & 0x80);

  return { value, bytesRead };
}

function decodeText(data: number[]): string {
  const uint8Array = new Uint8Array(data);
  
  // Prüfe ob es gültiges UTF-8 ist
  try {
    const utf8Decoder = new TextDecoder("utf-8", { fatal: true });
    return utf8Decoder.decode(uint8Array);
  } catch {
    // Fallback auf Windows-1252 (westeuropäisch, unterstützt ä, ü, ö, ß etc.)
    try {
      const win1252Decoder = new TextDecoder("windows-1252");
      return win1252Decoder.decode(uint8Array);
    } catch {
      // Letzter Fallback: Latin-1 (ISO-8859-1)
      return String.fromCharCode(...data);
    }
  }
}

/**
 * Konvertiert Ticks zu Sekunden unter Berücksichtigung aller Tempo-Änderungen
 */
function ticksToSecondsWithTempoChanges(
  targetTick: number, 
  ticksPerBeat: number, 
  tempoEvents: TempoEvent[]
): number {
  if (tempoEvents.length === 0) {
    // Kein Tempo definiert, nutze Default 120 BPM
    return (targetTick * 500000) / (ticksPerBeat * 1000000);
  }

  let seconds = 0;
  let lastTick = 0;
  let currentTempo = tempoEvents[0]?.tick === 0 ? tempoEvents[0].tempo : 500000;

  for (const tempoEvent of tempoEvents) {
    if (tempoEvent.tick >= targetTick) {
      // Ziel liegt vor diesem Tempo-Change
      break;
    }

    if (tempoEvent.tick > lastTick) {
      // Berechne Zeit bis zu diesem Tempo-Change
      const tickDelta = tempoEvent.tick - lastTick;
      seconds += (tickDelta * currentTempo) / (ticksPerBeat * 1000000);
      lastTick = tempoEvent.tick;
    }

    currentTempo = tempoEvent.tempo;
  }

  // Rest bis zum Ziel-Tick mit aktuellem Tempo
  const remainingTicks = targetTick - lastTick;
  seconds += (remainingTicks * currentTempo) / (ticksPerBeat * 1000000);

  return seconds;
}

/**
 * Formatiert Sekunden als LRC-Zeitstempel [mm:ss.xx]
 */
function formatLrcTime(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `[${minutes.toString().padStart(2, "0")}:${secs.toFixed(2).padStart(5, "0")}]`;
}

/**
 * Parst einen MIDI-Buffer und gibt die Rohdaten zurück
 */
function parseMidiBuffer(buffer: ArrayBuffer): ParsedMidiFile {
  const view = new DataView(buffer);
  let offset = 0;

  // Header lesen
  const headerChunk = readString(view, offset, 4);
  if (headerChunk !== "MThd") {
    throw new Error("Keine gültige MIDI-Datei");
  }
  offset += 4;

  const headerLength = view.getUint32(offset);
  offset += 4;

  const format = view.getUint16(offset);
  offset += 2;

  const numTracks = view.getUint16(offset);
  offset += 2;

  const ticksPerBeat = view.getUint16(offset);
  offset += 2;

  // Überspringe Rest des Headers falls länger
  offset += headerLength - 6;

  // Tracks lesen
  const tracks: MidiTrack[] = [];
  const tempoEvents: TempoEvent[] = [];
  let firstTempo = 500000; // Default: 120 BPM
  let firstTempoFound = false;

  for (let i = 0; i < numTracks; i++) {
    const trackChunk = readString(view, offset, 4);
    if (trackChunk !== "MTrk") {
      throw new Error(`Ungültiger Track-Header bei Track ${i}`);
    }
    offset += 4;

    const trackLength = view.getUint32(offset);
    offset += 4;

    const trackEnd = offset + trackLength;
    const events: MidiEvent[] = [];
    let trackName = `Track ${i}`;
    let trackAbsoluteTick = 0; // Absolute Zeit für Tempo-Events

    while (offset < trackEnd) {
      const deltaTime = readVariableLength(view, offset);
      offset += deltaTime.bytesRead;
      trackAbsoluteTick += deltaTime.value;

      const eventByte = view.getUint8(offset);
      offset++;

      if (eventByte === 0xff) {
        // Meta Event
        const metaType = view.getUint8(offset);
        offset++;

        const length = readVariableLength(view, offset);
        offset += length.bytesRead;

        const data: number[] = [];
        for (let j = 0; j < length.value; j++) {
          data.push(view.getUint8(offset + j));
        }
        offset += length.value;

        // Track Name (Meta Event 0x03)
        if (metaType === 0x03 && data.length > 0) {
          trackName = decodeText(data);
        }

        // Tempo (Meta Event 0x51)
        if (metaType === 0x51 && data.length >= 3) {
          const tempo = (data[0] << 16) | (data[1] << 8) | data[2];
          tempoEvents.push({ tick: trackAbsoluteTick, tempo });
          
          // Erstes Tempo merken für BPM-Anzeige
          if (!firstTempoFound) {
            firstTempo = tempo;
            firstTempoFound = true;
          }
        }

        events.push({
          deltaTime: deltaTime.value,
          type: 0xff,
          metaType,
          data,
        });
      } else if (eventByte === 0xf0 || eventByte === 0xf7) {
        // SysEx Event
        const length = readVariableLength(view, offset);
        offset += length.bytesRead + length.value;

        events.push({
          deltaTime: deltaTime.value,
          type: eventByte,
        });
      } else {
        // MIDI Event
        const eventType = (eventByte >> 4) & 0x0f;
        
        let dataBytes = 0;
        switch (eventType) {
          case 0x8: // Note Off
          case 0x9: // Note On
          case 0xa: // Aftertouch
          case 0xb: // Control Change
          case 0xe: // Pitch Bend
            dataBytes = 2;
            break;
          case 0xc: // Program Change
          case 0xd: // Channel Pressure
            dataBytes = 1;
            break;
          default:
            dataBytes = 0;
        }

        offset += dataBytes;

        events.push({
          deltaTime: deltaTime.value,
          type: eventByte,
        });
      }
    }

    tracks.push({ events, name: trackName });
  }

  // Tempo-Events nach Tick sortieren
  tempoEvents.sort((a, b) => a.tick - b.tick);

  return {
    header: { format, numTracks, ticksPerBeat },
    tracks,
    tempo: firstTempo,
    tempoEvents,
  };
}

/**
 * Zählt Lyrics in einem Track
 */
function countLyricsInTrack(track: MidiTrack): number {
  let count = 0;
  for (const event of track.events) {
    if (event.type === 0xff && event.metaType === 0x05 && event.data) {
      count++;
    }
  }
  return count;
}

/**
 * Parst MIDI-Datei und gibt Track-Informationen zurück
 */
export interface MidiFileInfo {
  tracks: MidiTrackInfo[];
  bpm: number;
  ticksPerBeat: number;
}

/**
 * Parst MIDI-Datei und gibt Track-Informationen + Tempo zurück
 */
export function parseMidiFile(buffer: ArrayBuffer): MidiFileInfo {
  cachedMidiFile = parseMidiBuffer(buffer);
  
  // BPM berechnen: 60,000,000 microseconds / tempo
  // Auf 2 Dezimalstellen runden für Genauigkeit
  const bpm = Math.round((60000000 / cachedMidiFile.tempo) * 100) / 100;
  
  const tracks = cachedMidiFile.tracks.map((track, index) => {
    const lyricsCount = countLyricsInTrack(track);
    return {
      index,
      name: track.name,
      hasLyrics: lyricsCount > 0,
      lyricsCount,
    };
  });
  
  return {
    tracks,
    bpm,
    ticksPerBeat: cachedMidiFile.header.ticksPerBeat,
  };
}

/**
 * Finde den Standard-Track (SysEx-Daten oder ersten mit Lyrics)
 */
export function findDefaultTrackIndex(tracks: MidiTrackInfo[]): number {
  // Suche nach "SysEx-Daten" Track
  const sysexTrack = tracks.find(t => t.name.toLowerCase().includes("sysex"));
  if (sysexTrack && sysexTrack.hasLyrics) {
    return sysexTrack.index;
  }
  
  // Fallback: Erster Track mit Lyrics
  const firstWithLyrics = tracks.find(t => t.hasLyrics);
  if (firstWithLyrics) {
    return firstWithLyrics.index;
  }
  
  return 0;
}

/**
 * Extrahiert Lyrics aus einem bestimmten Track
 */
export function extractLyricsFromTrack(trackIndex: number): { lines: LrcLine[]; lrcText: string } {
  if (!cachedMidiFile) {
    throw new Error("Keine MIDI-Datei geladen. Rufe zuerst parseMidiFile() auf.");
  }

  const midi = cachedMidiFile;
  const track = midi.tracks[trackIndex];
  
  if (!track) {
    throw new Error(`Track ${trackIndex} existiert nicht.`);
  }

  const lines: LrcLine[] = [];
  let absoluteTick = 0;
  let currentLine = "";
  let lineStartTick: number | null = null;

  for (const event of track.events) {
    absoluteTick += event.deltaTime;

    // Lyrics Event (0x05)
    if (event.type === 0xff && event.metaType === 0x05 && event.data) {
      const text = decodeText(event.data);

      // Überspringe Platzhalter und Metadaten
      if (text.startsWith("---") || text.startsWith("(c)") || text.includes(":")) {
        continue;
      }

      // Zeilenumbruch erkannt
      if (text === "\r" || text === "\n" || text.endsWith("\r") || text.endsWith("\n")) {
        if (text !== "\r" && text !== "\n") {
          if (lineStartTick === null) {
            lineStartTick = absoluteTick;
          }
          currentLine += text.replace(/[\r\n]/g, "").trimEnd();
        }

        // Zeile speichern
        if (currentLine.trim()) {
          const timeInSeconds = ticksToSecondsWithTempoChanges(
            lineStartTick ?? absoluteTick, 
            midi.header.ticksPerBeat, 
            midi.tempoEvents
          );
          lines.push({
            time: timeInSeconds,
            text: currentLine.trim(),
          });
        }

        currentLine = "";
        lineStartTick = null;
      } else {
        // Startzeit merken
        if (lineStartTick === null) {
          lineStartTick = absoluteTick;
        }
        currentLine += text;
      }
    }
  }

  // Letzte Zeile
  if (currentLine.trim()) {
    const timeInSeconds = ticksToSecondsWithTempoChanges(
      lineStartTick ?? absoluteTick, 
      midi.header.ticksPerBeat, 
      midi.tempoEvents
    );
    lines.push({
      time: timeInSeconds,
      text: currentLine.trim(),
    });
  }

  // LRC-Text generieren
  const lrcText = lines.map((line) => `${formatLrcTime(line.time)} ${line.text}`).join("\n");

  return { lines, lrcText };
}

/**
 * Legacy-Funktion für Kompatibilität
 */
export function parseMidiToLrc(buffer: ArrayBuffer): { lines: LrcLine[]; lrcText: string } {
  const midiInfo = parseMidiFile(buffer);
  const defaultTrack = findDefaultTrackIndex(midiInfo.tracks);
  return extractLyricsFromTrack(defaultTrack);
}
