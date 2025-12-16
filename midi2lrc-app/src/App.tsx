import { useCallback, useState, FC } from "react";
import { Download, Upload, Music, FileText, GitHub, RefreshCw, ChevronDown } from "react-feather";
import { useDropzone } from "react-dropzone";
import { 
  parseMidiFile, 
  extractLyricsFromTrack, 
  findDefaultTrackIndex,
  LrcLine, 
  MidiTrackInfo
} from "./utils/midiParser";
import { generateAbletonFile, downloadAbletonFile } from "./utils/abletonGenerator";

const App: FC = () => {
  const [fileName, setFileName] = useState("");
  const [lrcContent, setLrcContent] = useState("");
  const [lrcLines, setLrcLines] = useState<LrcLine[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Neue States für Track-Auswahl
  const [tracks, setTracks] = useState<MidiTrackInfo[]>([]);
  const [selectedTrackIndex, setSelectedTrackIndex] = useState<number>(0);
  const [bpm, setBpm] = useState<number>(0);

  const processTrack = (trackIndex: number) => {
    try {
      const result = extractLyricsFromTrack(trackIndex);
      setLrcLines(result.lines);
      setLrcContent(result.lrcText);
      setSelectedTrackIndex(trackIndex);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fehler beim Extrahieren der Lyrics");
    }
  };

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    const file = acceptedFiles[0];

    if (!file) {
      setError("Keine gültige Datei gefunden");
      return;
    }

    setIsProcessing(true);
    setError(null);

    try {
      const arrayBuffer = await file.arrayBuffer();
      
      // Parse MIDI und hole Track-Infos + BPM
      const midiInfo = parseMidiFile(arrayBuffer);
      setTracks(midiInfo.tracks);
      setBpm(midiInfo.bpm);
      
      // Finde Standard-Track (SysEx-Daten)
      const defaultTrackIdx = findDefaultTrackIndex(midiInfo.tracks);
      
      // Extrahiere Lyrics aus dem Standard-Track
      const result = extractLyricsFromTrack(defaultTrackIdx);
      
      setFileName(file.name.replace(/\.mid$/i, ""));
      setSelectedTrackIndex(defaultTrackIdx);
      setLrcLines(result.lines);
      setLrcContent(result.lrcText);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fehler beim Parsen der MIDI-Datei");
    } finally {
      setIsProcessing(false);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    multiple: false,
    noClick: false,
    accept: {
      "audio/midi": [".mid", ".midi"],
    },
  });

  const handleDownload = () => {
    if (!lrcContent) return;

    const blob = new Blob([lrcContent], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${fileName || "lyrics"}.lrc`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleAbletonDownload = async () => {
    if (lrcLines.length === 0) return;

    try {
      // Konvertiere LrcLines zu LineInfo für Ableton
      const lineInfos = lrcLines.map((line, i, arr) => ({
        start: line.time,
        end: arr[i + 1]?.time ?? line.time + 5,
        text: line.text,
      }));

      const blob = await generateAbletonFile(fileName || "Lyrics", bpm, lineInfos);
      downloadAbletonFile(blob, fileName || "Lyrics");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fehler beim Erstellen der Ableton-Datei");
    }
  };

  const handleReset = () => {
    setFileName("");
    setLrcContent("");
    setLrcLines([]);
    setTracks([]);
    setSelectedTrackIndex(0);
    setBpm(0);
    setError(null);
  };

  return (
    <div className="flex min-h-screen flex-col">
      {/* Header */}
      <header className="border-b border-background-light py-4">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4">
          <div className="flex items-center gap-3">
            <Music className="h-8 w-8 text-accent" />
            <span className="text-xl font-bold">MIDI2LRC</span>
          </div>
          <a
            href="https://github.com/iSimon97"
            target="_blank"
            rel="noopener noreferrer"
            className="text-gray-400 transition hover:text-white"
          >
            <GitHub className="h-6 w-6" />
          </a>
        </div>
      </header>

      {/* Main Content */}
      <main className="mx-auto flex w-full max-w-4xl flex-grow flex-col px-4 py-10">
        <div className="mb-8 text-center">
          <h1 className="mb-4 text-4xl font-bold">
            MIDI Lyrics zu LRC Konverter
          </h1>
          <p className="text-gray-400">
            Konvertiere MIDI-Dateien mit Lyrics (z.B. Karaoke-Files) in das LRC-Format
            für Lyrics-Anzeige in Musik-Apps.
          </p>
        </div>

        {!lrcContent ? (
          /* Upload Area */
          <div
            {...getRootProps()}
            className={`
              flex h-80 cursor-pointer flex-col items-center justify-center 
              rounded-xl border-2 border-dashed transition-all
              ${isDragActive 
                ? "border-accent bg-accent/10" 
                : "border-gray-600 bg-background-light hover:border-gray-500 hover:bg-background-hover"
              }
            `}
          >
            <input {...getInputProps()} />
            
            {isProcessing ? (
              <div className="flex flex-col items-center">
                <RefreshCw className="mb-4 h-16 w-16 animate-spin text-accent" />
                <p className="text-lg">Verarbeite MIDI-Datei...</p>
              </div>
            ) : (
              <>
                <Upload className={`mb-4 h-16 w-16 ${isDragActive ? "text-accent" : "text-gray-500"}`} />
                <p className="mb-2 text-lg">
                  {isDragActive 
                    ? "MIDI-Datei hier ablegen..." 
                    : "MIDI-Datei hierher ziehen oder klicken"
                  }
                </p>
                <p className="text-sm text-gray-500">
                  Unterstützt .mid und .midi Dateien mit eingebetteten Lyrics
                </p>
              </>
            )}

            {error && (
              <div className="mt-4 rounded-lg bg-red-900/50 px-4 py-2 text-red-300">
                {error}
              </div>
            )}
          </div>
        ) : (
          /* Result Area */
          <div className="flex flex-col gap-6">
            {/* File Info + BPM */}
            <div className="flex items-center justify-between rounded-lg bg-background-light p-4">
              <div className="flex items-center gap-3">
                <FileText className="h-6 w-6 text-accent" />
                <div>
                  <p className="font-medium">{fileName}.lrc</p>
                  <p className="text-sm text-gray-400">
                    {lrcLines.length} Zeilen extrahiert
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-4">
                {/* BPM Anzeige */}
                <div className="flex items-center gap-2 rounded-lg bg-background-hover px-4 py-2">
                  <span className="text-2xl font-bold text-accent">{bpm}</span>
                  <span className="text-sm text-gray-400">BPM</span>
                </div>
                <button
                  onClick={handleReset}
                  className="rounded-lg px-4 py-2 text-gray-400 transition hover:bg-background-hover hover:text-white"
                >
                  Neue Datei
                </button>
              </div>
            </div>

            {/* Track Selection */}
            <div className="rounded-lg bg-background-light p-4">
              <label className="mb-2 block text-sm text-gray-400">
                Lyrics-Track auswählen
              </label>
              <div className="relative">
                <select
                  value={selectedTrackIndex}
                  onChange={(e) => processTrack(Number(e.target.value))}
                  className="w-full appearance-none rounded-lg bg-background-hover px-4 py-3 pr-10 text-white outline-none transition focus:ring focus:ring-accent/50"
                >
                  {tracks.map((track) => (
                    <option key={track.index} value={track.index}>
                      {track.name}
                      {track.hasLyrics 
                        ? ` (${track.lyricsCount} Lyrics)` 
                        : " (keine Lyrics)"}
                    </option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
              </div>
              {tracks.length > 0 && (
                <p className="mt-2 text-xs text-gray-500">
                  {tracks.filter(t => t.hasLyrics).length} von {tracks.length} Tracks enthalten Lyrics
                </p>
              )}
            </div>

            {/* Preview */}
            <div className="relative">
              <div className="absolute right-3 top-3 rounded bg-background px-2 py-1 text-xs text-gray-500">
                Vorschau
              </div>
              <textarea
                readOnly
                value={lrcContent}
                className="h-96 w-full resize-none rounded-xl bg-background-light p-4 font-mono text-sm text-gray-300 shadow-glow outline-none"
              />
            </div>

            {/* Download Buttons */}
            <div className="flex gap-4">
              <button
                onClick={handleDownload}
                className="flex flex-1 items-center justify-center gap-3 rounded-xl bg-accent py-4 text-lg font-semibold text-black transition hover:bg-accent-hover"
              >
                <Download className="h-5 w-5" />
                LRC-Datei
              </button>
              <button
                onClick={handleAbletonDownload}
                className="flex flex-1 items-center justify-center gap-3 rounded-xl bg-orange-500 py-4 text-lg font-semibold text-black transition hover:bg-orange-600"
              >
                <Download className="h-5 w-5" />
                Ableton Live (.als)
              </button>
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-background-light py-6">
        <div className="mx-auto max-w-4xl px-4 text-center text-sm text-gray-500">
          <p>MIDI2LRC – Konvertiere MIDI Lyrics zu LRC Format</p>
        </div>
      </footer>
    </div>
  );
};

export default App;
