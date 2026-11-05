//! Session logs: a plain-text copy of what a terminal printed, for audits and debugging.
//!
//! The output stream is reduced to readable text as it is written: colour and cursor escape
//! sequences are dropped, `\r\n` becomes `\n`, and a line redrawn with a bare `\r` (progress
//! bars, spinners) keeps only its final state. Lines K-Shell types itself into the shell
//! (the hidden prompt / working-directory hook) are left out.

use std::fs::File;
use std::io::{BufWriter, Write};
use std::path::{Path, PathBuf};

/// Marker text in the line K-Shell types into new shells (see src/lib/prompt.js).
const INJECTED: &[u8] = b"7770;k";
/// Longest line kept; anything after is cut so a binary dump can't grow a line forever.
const MAX_LINE: usize = 16 * 1024;

#[derive(Clone, Copy, PartialEq)]
enum Esc {
    None,
    /// After ESC.
    Start,
    /// CSI: ESC [ … final byte.
    Csi,
    /// OSC / DCS / APC / PM / SOS: until BEL or ESC \.
    Str,
    /// ESC seen inside a string sequence.
    StrEnd,
    /// A two-byte sequence like ESC ( B: skip one more byte.
    One,
}

pub struct SessionLog {
    out: BufWriter<File>,
    line: Vec<u8>,
    esc: Esc,
    /// A `\r` was seen: a following `\n` ends the line, anything else redraws it.
    cr: bool,
}

impl SessionLog {
    /// Start a log for `label` in `dir` (created if needed), named after the date and label.
    pub fn create(dir: &Path, label: &str) -> std::io::Result<Self> {
        std::fs::create_dir_all(dir)?;
        let now = chrono::Local::now();
        let safe: String = label
            .chars()
            .map(|c| if c.is_alphanumeric() || "-_.@".contains(c) { c } else { '_' })
            .take(60)
            .collect();
        let path = dir.join(format!("{} {}.log", now.format("%Y-%m-%d %H-%M-%S"), safe));
        let mut out = BufWriter::new(File::create(path)?);
        writeln!(out, "# K-Shell session log · {label} · started {}", now.format("%Y-%m-%d %H:%M:%S %z"))?;
        Ok(Self { out, line: Vec::new(), esc: Esc::None, cr: false })
    }

    /// Feed raw terminal output.
    pub fn write(&mut self, data: &[u8]) {
        for &b in data {
            self.byte(b);
        }
        let _ = self.out.flush();
    }

    fn byte(&mut self, b: u8) {
        match self.esc {
            Esc::Start => {
                self.esc = match b {
                    b'[' => Esc::Csi,
                    b']' | b'P' | b'_' | b'^' | b'X' => Esc::Str,
                    b'(' | b')' | b'*' | b'+' | b'#' | b'%' => Esc::One,
                    _ => Esc::None,
                };
                return;
            }
            Esc::Csi => {
                if (0x40..=0x7e).contains(&b) {
                    self.esc = Esc::None;
                }
                return;
            }
            Esc::Str => {
                if b == 0x07 {
                    self.esc = Esc::None;
                } else if b == 0x1b {
                    self.esc = Esc::StrEnd;
                }
                return;
            }
            Esc::StrEnd => {
                self.esc = if b == b'\\' { Esc::None } else { Esc::Str };
                return;
            }
            Esc::One => {
                self.esc = Esc::None;
                return;
            }
            Esc::None => {}
        }
        if self.cr && b != b'\n' {
            self.line.clear(); // the line is being redrawn from its start
        }
        self.cr = false;
        match b {
            0x1b => self.esc = Esc::Start,
            b'\r' => self.cr = true,
            b'\n' => self.end_line(),
            0x08 => {
                self.line.pop();
            }
            b'\t' => self.push(b),
            0x00..=0x1f | 0x7f => {}
            _ => self.push(b),
        }
    }

    fn push(&mut self, b: u8) {
        if self.line.len() < MAX_LINE {
            self.line.push(b);
        }
    }

    fn end_line(&mut self) {
        if !self.line.windows(INJECTED.len()).any(|w| w == INJECTED) {
            let _ = self.out.write_all(&self.line);
            let _ = self.out.write_all(b"\n");
        }
        self.line.clear();
    }
}

impl Drop for SessionLog {
    fn drop(&mut self) {
        if !self.line.is_empty() {
            self.end_line();
        }
        let _ = self.out.flush();
    }
}

/// Where logs go when no folder is set: Documents/K-Shell Logs (or the home folder).
pub fn default_dir() -> PathBuf {
    dirs::document_dir().or_else(dirs::home_dir).unwrap_or_else(std::env::temp_dir).join("K-Shell Logs")
}

/// The log folder from the settings value ("" = default, leading "~" = home).
pub fn dir_from_setting(s: &str) -> PathBuf {
    let s = s.trim();
    if s.is_empty() {
        return default_dir();
    }
    match (s.strip_prefix('~'), dirs::home_dir()) {
        (Some(rest), Some(h)) => h.join(rest.trim_start_matches(['/', '\\'])),
        _ => PathBuf::from(s),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn run(input: &[u8]) -> String {
        let dir = std::env::temp_dir().join(format!("kshell-log-test-{}", uuid::Uuid::new_v4()));
        let path = {
            let mut l = SessionLog::create(&dir, "test host").unwrap();
            l.write(input);
            std::fs::read_dir(&dir).unwrap().next().unwrap().unwrap().path()
        };
        let text = std::fs::read_to_string(path).unwrap();
        let _ = std::fs::remove_dir_all(&dir);
        text.split_once('\n').unwrap().1.to_string() // drop the header
    }

    #[test]
    fn strips_escapes_and_keeps_text() {
        let out = run(b"\x1b[1;32muser@host\x1b[0m:\x1b[34m~\x1b[0m$ ls\r\n\x1b]0;title\x07file.txt\r\n");
        assert_eq!(out, "user@host:~$ ls\nfile.txt\n");
    }

    #[test]
    fn redrawn_line_keeps_final_state() {
        assert_eq!(run(b"10%\r50%\r100%\r\ndone\n"), "100%\ndone\n");
    }

    #[test]
    fn drops_injected_line_and_backspaces() {
        let out = run(b" [ -n x ] && eval '...'; printf '\\033]7770;k\\007'\r\nab\x08c\n");
        assert_eq!(out, "ac\n");
    }

    #[test]
    fn string_sequences_end_with_st() {
        assert_eq!(run(b"\x1b]7;file://h/tmp\x1b\\ok\n\x1bPdata\x1b\\x\n"), "ok\nx\n");
    }

    #[test]
    fn last_line_flushed_on_drop() {
        assert_eq!(run(b"no newline"), "no newline\n");
    }
}
