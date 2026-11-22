//! Turn PTY byte chunks into text without splitting multi-byte characters.

/// Keeps the tail of a chunk that ends mid-character until the next chunk arrives.
#[derive(Debug, Default)]
pub struct Utf8Stream {
    pending: Vec<u8>,
}

impl Utf8Stream {
    /// Decode `bytes` after whatever was left over from the last call.
    /// Invalid bytes become U+FFFD; an incomplete character at the end is held back.
    pub fn push(&mut self, bytes: &[u8]) -> String {
        self.pending.extend_from_slice(bytes);
        let mut out = String::with_capacity(self.pending.len());
        let mut rest: &[u8] = &self.pending;
        loop {
            match std::str::from_utf8(rest) {
                Ok(text) => {
                    out.push_str(text);
                    rest = &[];
                    break;
                }
                Err(err) => {
                    let valid = err.valid_up_to();
                    out.push_str(std::str::from_utf8(&rest[..valid]).unwrap_or_default());
                    match err.error_len() {
                        Some(bad) => {
                            out.push('\u{FFFD}');
                            rest = &rest[valid + bad..];
                        }
                        None => {
                            rest = &rest[valid..];
                            break;
                        }
                    }
                }
            }
        }
        self.pending = rest.to_vec();
        out
    }

    /// Whatever is still held back, decoded lossily. Call once the stream ends.
    pub fn finish(&mut self) -> String {
        let tail = String::from_utf8_lossy(&self.pending).into_owned();
        self.pending.clear();
        tail
    }
}
