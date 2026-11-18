from tools import discord


def test_the_channel_id_is_read_from_outside_the_repo(tmp_path, monkeypatch):
    path = tmp_path / "discord-channel"
    path.write_bytes(b"\xef\xbb\xbf123456789\r\n")  # as PowerShell's Set-Content may write it
    monkeypatch.setattr(discord, "CHANNEL_FILE", path)
    assert discord.channel() == "123456789"
