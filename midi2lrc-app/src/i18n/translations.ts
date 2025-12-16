export const translations = {
  de: {
    title: "MIDI Lyrics zu LRC Konverter",
    subtitle: "Konvertiere MIDI-Dateien mit Lyrics (z.B. Karaoke-Files) in das LRC-Format für Lyrics-Anzeige in Musik-Apps.",
    // Dropzone
    dropHere: "MIDI-Datei hier ablegen...",
    dragOrClick: "MIDI-Datei hierher ziehen oder klicken",
    supportedFormats: "Unterstützt .mid und .midi Dateien mit eingebetteten Lyrics",
    processing: "Verarbeite MIDI-Datei...",
    // Result
    linesExtracted: "Zeilen extrahiert",
    newFile: "Neue Datei",
    selectTrack: "Lyrics-Track auswählen",
    noLyrics: "keine Lyrics",
    tracksWithLyrics: "von {total} Tracks enthalten Lyrics",
    preview: "Vorschau",
    downloadLrc: "LRC-Datei",
    downloadAbleton: "Ableton Live (.als)",
    // Errors
    errorNoFile: "Keine gültige Datei gefunden",
    errorParse: "Fehler beim Parsen der MIDI-Datei",
    errorExtract: "Fehler beim Extrahieren der Lyrics",
    errorAbleton: "Fehler beim Erstellen der Ableton-Datei",
    // Language
    switchLanguage: "Switch to English",
    // Footer
    footer: "MIDI2LRC – Konvertiere MIDI Lyrics zu LRC Format",
  },
  en: {
    title: "MIDI Lyrics to LRC Converter",
    subtitle: "Convert MIDI files with lyrics (e.g. karaoke files) to LRC format for lyrics display in music apps.",
    // Dropzone
    dropHere: "Drop MIDI file here...",
    dragOrClick: "Drag MIDI file here or click to select",
    supportedFormats: "Supports .mid and .midi files with embedded lyrics",
    processing: "Processing MIDI file...",
    // Result
    linesExtracted: "lines extracted",
    newFile: "New File",
    selectTrack: "Select lyrics track",
    noLyrics: "no lyrics",
    tracksWithLyrics: "of {total} tracks contain lyrics",
    preview: "Preview",
    downloadLrc: "LRC File",
    downloadAbleton: "Ableton Live (.als)",
    // Errors
    errorNoFile: "No valid file found",
    errorParse: "Error parsing MIDI file",
    errorExtract: "Error extracting lyrics",
    errorAbleton: "Error creating Ableton file",
    // Language
    switchLanguage: "Zu Deutsch wechseln",
    // Footer
    footer: "MIDI2LRC – Convert MIDI Lyrics to LRC Format",
  },
};

export type Language = keyof typeof translations;
export type TranslationKey = typeof translations.de;
