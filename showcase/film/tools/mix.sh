#!/bin/sh
# Final audio: narration + ducked music + game sound, normalised for web video.
V="$(cd "$(dirname "$0")/.." && pwd)"; A="$V/../../assets/music"
VO=""; FC=""; i=0; MIXIN=""
for seg in "n01 1.4" "n02 20.6" "n03 30.2" "n04 42.6" "n05 63.0" "n06 84.2" "n07 111.6" "n08 130.8" "n09 154.0" "n10 171.0" "n11 206.6" "n12 222.2" "n13 257.0"; do
  set -- $seg; ms=$(awk "BEGIN{printf \"%d\", $2*1000}")
  VO="$VO -i $V/vo/$1.wav"; FC="$FC[$i:a]adelay=$ms:all=1[v$i];"; MIXIN="$MIXIN[v$i]"; i=$((i+1))
done
ffmpeg -v error -y $VO \
  -i $A/duel.mp3 -i $A/night.mp3 -i $A/duel.mp3 -i $A/title.mp3 -i $V/audio/sfx.wav \
  -filter_complex "$FC ${MIXIN}amix=inputs=13:normalize=0,apad=whole_dur=271,highpass=f=70,acompressor=threshold=-20dB:ratio=3:attack=8:release=160:makeup=2,loudnorm=I=-17:TP=-2:LRA=9,aformat=channel_layouts=stereo,asplit=2[vo][key];
   [13:a]atrim=0:21,afade=t=in:d=0.6,afade=t=out:st=19.2:d=1.8,volume=0.42[m1];
   [14:a]atrim=4:139,asetpts=PTS-STARTPTS,afade=t=in:d=2,afade=t=out:st=131.6:d=3.2,volume=0.32,adelay=20000:all=1[m2];
   [15:a]atrim=20:86,asetpts=PTS-STARTPTS,afade=t=in:d=2.5,afade=t=out:st=61.5:d=4.5,volume=0.36,adelay=163200:all=1[m3];
   [16:a]afade=t=in:d=3,afade=t=out:st=41:d=3,volume=0.52,adelay=226800:all=1[m4];
   [17:a]volume=0.6[sfx];
   [m1][m2][m3][m4][sfx]amix=inputs=5:normalize=0,apad=whole_dur=271,aformat=channel_layouts=stereo[bed];
   [bed][key]sidechaincompress=threshold=0.025:ratio=5:attack=30:release=520:makeup=1[duck];
   [vo][duck]amix=inputs=2:normalize=0,alimiter=limit=0.89,atrim=0:271,afade=t=out:st=268.6:d=2.4[out]" \
  -map "[out]" -ar 48000 -c:a pcm_s16le "$V/audio/mix.wav" && ffmpeg -hide_banner -i "$V/audio/mix.wav" -af loudnorm=print_format=summary -f null - 2>&1 | grep -E "Input Integrated|Input True Peak|Input LRA"
