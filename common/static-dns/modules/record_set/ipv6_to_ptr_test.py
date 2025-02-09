from ipv6_to_ptr import convert


def test_convert():
    assert (
        convert("2001:470:e022:4::1")
        == "1.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.4.0.0.0.2.2.0.e.0.7.4.0.1.0.0.2.ip6.arpa."
    )
    assert (
        convert("2001:470:e022:5:f25c:c0:44cf:998f")
        == "f.8.9.9.f.c.4.4.0.c.0.0.c.5.2.f.5.0.0.0.2.2.0.e.0.7.4.0.1.0.0.2.ip6.arpa."
    )
