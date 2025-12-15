# MIDI2LRC

A simple web app to convert MIDI files with embedded lyrics to LRC format.

## Why?

I needed lrc files from midi lyrics. So i've used ai shit to vibe code something (as in all my public repos i used ai for most things - sorry).

The main reason i built this is to use it with [AbleSet](https://ableset.app/) which is a really good software for live performance with Ableton Live. It can display synced lyrics on stage monitors, but needs LRC files for that. Most karaoke MIDI files have lyrics embedded, so this tool extracts them.

## Features

- Drag and drop MIDI files
- Automatic detection of lyrics track (defaults to "SysEx-Daten" track)
- Manual track selection if needed
- Shows BPM from the MIDI file
- Supports German umlauts and special characters
- Download as .lrc file

## Usage

### Web App

```bash
cd midi2lrc-app
npm install
npm run dev
```

Then open http://localhost:5173 in your browser.

### Python Script

There's also a simple Python script if you prefer command line:

```bash
pip install mido
python midi2lrc.py input.mid output.lrc
```

## Tech Stack

- React + TypeScript
- Vite
- Tailwind CSS
- Custom MIDI parser (no external MIDI library in the browser)

## License

Do whatever you want with it.
