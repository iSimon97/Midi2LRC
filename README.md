# Midi2LRC

Konvertiert MIDI-Dateien mit Text-Events in LRC-Dateien (Lyrics-Format).

## 🚀 Schnellstart

### Voraussetzungen
- Python 3.7 oder höher
- VS Code (empfohlen)

### Installation & Start

1. **Repository klonen**
   ```bash
   git clone https://github.com/iSimon97/Midi2LRC.git
   cd Midi2LRC
   ```

2. **In VS Code öffnen**
   ```bash
   code .
   ```

3. **Virtuelle Umgebung wird automatisch erstellt**
   - VS Code erkennt die fehlende `.venv` und fragt, ob sie erstellt werden soll
   - Klicke auf "Ja" oder erstelle sie manuell:
     ```bash
     python3 -m venv .venv
     ```

4. **Abhängigkeiten installieren**
   - VS Code sollte automatisch fragen, ob Requirements installiert werden sollen
   - Oder manuell im Terminal:
     ```bash
     pip install -r requirements.txt
     ```

5. **Programm starten**
   - **Einfachste Methode**: Drücke `F5` in VS Code
   - Oder im Terminal: `python3 midi2lrc.py`

## 📝 Verwendung

Das Skript liest MIDI-Dateien und extrahiert Text aus der Spur "SysEx-Daten", um daraus eine LRC-Datei zu erstellen.

```bash
python3 midi2lrc.py input.mid
```

## 🛠️ Entwicklung

### VS Code Konfiguration

Das Projekt enthält bereits `.vscode/launch.json` für einfaches Debugging:
- Drücke `F5` zum Starten
- Setze Breakpoints mit Klick auf die Zeilennummer
- Nutze die Debug-Console für interaktive Befehle

### Projekt-Struktur
```
Midi2LRC/
├── midi2lrc.py          # Hauptprogramm
├── requirements.txt      # Python-Abhängigkeiten
├── README.md            # Diese Datei
└── .vscode/
    └── launch.json      # VS Code Debug-Konfiguration
```

## 📦 Abhängigkeiten

- `mido` - MIDI-Datei Parser

## 📄 Lizenz

[Lizenz hier einfügen]