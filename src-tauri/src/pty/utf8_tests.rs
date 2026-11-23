use super::utf8::Utf8Stream;

#[test]
fn passes_plain_ascii_through() {
    let mut s = Utf8Stream::default();
    assert_eq!(s.push(b"hello"), "hello");
    assert_eq!(s.finish(), "");
}

#[test]
fn holds_back_a_character_split_across_chunks() {
    let euro = "€".as_bytes(); // 3 bytes
    let mut s = Utf8Stream::default();
    assert_eq!(s.push(&[b'a', euro[0]]), "a");
    assert_eq!(s.push(&euro[1..2]), "");
    assert_eq!(s.push(&[euro[2], b'b']), "€b");
}

#[test]
fn replaces_invalid_bytes_and_keeps_going() {
    let mut s = Utf8Stream::default();
    assert_eq!(s.push(&[b'x', 0xFF, b'y']), "x\u{FFFD}y");
}

#[test]
fn finish_flushes_an_incomplete_tail_lossily() {
    let mut s = Utf8Stream::default();
    assert_eq!(s.push(&"é".as_bytes()[..1]), "");
    assert_eq!(s.finish(), "\u{FFFD}");
}
