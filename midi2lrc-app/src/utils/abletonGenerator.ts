/**
 * Ableton Live Project Generator
 * Erzeugt .als Dateien mit Lyrics-Clips für AbleSet
 */

import pako from "pako";

export interface LineInfo {
  start: number;  // Zeit in Sekunden
  end: number;    // Zeit in Sekunden
  text: string;
}

/**
 * Konvertiert Sekunden zu Beats
 */
function timeToBeats(seconds: number, bpm: number, quantize = 2): number {
  const beatsPerSecond = bpm / 60;
  const beats = seconds * beatsPerSecond;
  return Math.round(beats * quantize) / quantize;
}

/**
 * Setzt ein Attribut in einem XML-Element
 */
function setAttribute(el: Element, tag: string, attr: string, value: string): void {
  const element = el.getElementsByTagName(tag).item(0);
  if (element) {
    element.setAttribute(attr, value);
  }
}

/**
 * Generiert eine Ableton Live .als Datei mit Lyrics-Clips
 */
export async function generateAbletonFile(
  songName: string,
  bpm: number,
  lines: LineInfo[],
  closeGaps = true
): Promise<Blob> {
  // Template laden
  const response = await fetch("/template.xml");
  const template = await response.text();

  if (lines.length === 0) {
    throw new Error("Keine Lyrics vorhanden");
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(template, "text/xml");

  // Finde wichtige Elemente
  const tempo = doc.getElementsByTagName("Tempo").item(0);
  const tempoEvent = doc.getElementsByTagName("FloatEvent").item(0);
  const track = doc.getElementsByTagName("MidiTrack").item(0);
  const locator = doc.getElementsByTagName("Locator").item(0);
  const trackName = track?.getElementsByTagName("Name").item(0);
  const nextPointeeId = doc.getElementsByTagName("NextPointeeId").item(0);
  
  // Finde den ClipTimeable Container
  const events = track
    ?.getElementsByTagName("ClipTimeable")
    .item(0)
    ?.children.item(0)  // ArrangerAutomation
    ?.children.item(0); // Events
  const clip = events?.children.item(0);

  if (!tempo || !tempoEvent || !track || !trackName || !events || !clip || !locator) {
    throw new Error("Template-Struktur ungültig");
  }

  // Track-Name setzen
  const trackTitle = `Vocals +LYRICS`;
  setAttribute(trackName, "UserName", "Value", trackTitle);
  setAttribute(trackName, "EffectiveName", "Value", trackTitle);

  // Tempo setzen
  setAttribute(tempo, "Manual", "Value", String(bpm));
  tempoEvent.setAttribute("Value", String(bpm));

  // Song-Name im Locator setzen
  setAttribute(locator, "Name", "Value", songName);

  // Gaps schließen (nächste Zeile beginnt wo vorherige endet)
  const processedLines = closeGaps
    ? lines.map((line, i, arr) => {
        const nextLine = arr[i + 1];
        if (nextLine && nextLine.start - line.end < 2) {
          return { ...line, end: nextLine.start };
        }
        return line;
      })
    : lines;

  // Start-ID für neue Clips (nach existierenden IDs)
  let clipId = 20000;

  // Clips erstellen
  for (const line of processedLines) {
    if (!line.text) continue;

    const startTime = timeToBeats(line.start, bpm);
    const endTime = timeToBeats(line.end, bpm);

    const lineClip = clip.cloneNode(true) as Element;
    
    // Einzigartige ID für diesen Clip
    lineClip.setAttribute("Id", String(clipId++));
    lineClip.setAttribute("Time", String(startTime));
    setAttribute(lineClip, "Name", "Value", line.text);
    setAttribute(lineClip, "CurrentStart", "Value", String(startTime));
    setAttribute(lineClip, "CurrentEnd", "Value", String(endTime));
    
    // Aktualisiere alle verschachtelten IDs
    const innerElements = lineClip.querySelectorAll("[Id]");
    for (const el of Array.from(innerElements)) {
      if (el !== lineClip) {
        el.setAttribute("Id", String(clipId++));
      }
    }
    
    events.appendChild(lineClip);
  }

  // Original-Clip entfernen
  events.removeChild(clip);

  // NextPointeeId aktualisieren (muss größer sein als alle verwendeten IDs)
  if (nextPointeeId) {
    nextPointeeId.setAttribute("Value", String(clipId + 1000));
  }

  // XML serialisieren
  const serializer = new XMLSerializer();
  const serialized = serializer.serializeToString(doc);

  // GZIP komprimieren
  const gzipped = pako.gzip(serialized);

  return new Blob([gzipped], { type: "application/octet-stream" });
}

/**
 * Download-Funktion
 */
export function downloadAbletonFile(blob: Blob, songName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${songName} - Synced Lyrics for AbleSet.als`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
