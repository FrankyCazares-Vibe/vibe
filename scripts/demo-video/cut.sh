#!/bin/zsh
# Join the three clips record.mjs wrote into one 1080x1920 mp4, with a short fade between them.
# The clips are recorded at phone size (390x844) and scaled up, so the result is a little soft:
# good for a draft, not the final cut. Trim points come from take/cuts.json.
set -e
TAKE="${DEMO_OUT:-$HOME/vibe-demo-video/take}"
OUT="${1:-$HOME/vibe-demo-video/vibe-demo-draft.mp4}"
cd "$TAKE"
read A0 A1 B0 B1 C0 C1 <<< "$(node -e 'const c=require("./cuts.json");console.log(c["a-hero"].start,c["a-hero"].end,c["b-app"].start,c["b-app"].end,c["c-close"].start,c["c-close"].end)')"
P="crop=390:844:0:0,fps=30,scale=888:1920:flags=lanczos,pad=1080:1920:(ow-iw)/2:0:color=0x0C0B0B,format=yuv420p"
X1=$(node -e "console.log(($A1-$A0-0.5).toFixed(2))")
X2=$(node -e "console.log(($A1-$A0-0.5+$B1-$B0-0.5).toFixed(2))")
ffmpeg -v error -y -i a-hero.webm -i b-app.webm -i c-close.webm -filter_complex \
  "[0]trim=start=$A0:end=$A1,setpts=PTS-STARTPTS,${P}[a];[1]trim=start=$B0:end=$B1,setpts=PTS-STARTPTS,${P}[b];[2]trim=start=$C0:end=$C1,setpts=PTS-STARTPTS,${P}[c];[a][b]xfade=transition=fade:duration=0.5:offset=$X1[ab];[ab][c]xfade=transition=fade:duration=0.5:offset=$X2[v]" \
  -map "[v]" -c:v libx264 -crf 18 -preset medium -movflags +faststart "$OUT"
echo "wrote $OUT"
