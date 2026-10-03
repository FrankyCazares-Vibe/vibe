#!/bin/bash
# Cut the take record.mjs filmed into the two films. Reads the lossless reels and take.json from
# ~/vibe-demo-video/take (or $DEMO_OUT/take) and writes, next to that folder:
#
#   vibe-demo-30s-master.mp4      the film as filmed: 1170x2532, H.264 yuv420p, 60 fps, crf 14
#   vibe-demo-30s-1080x1920.mp4   for Instagram and the landing page: the phone screen 810 px wide with
#                                 rounded corners and a hairline border, centred on a near-black canvas
#                                 with a soft coral glow low in the right corner. No phone hardware, no text.
#
#   vibe-demo-30s-poster.jpg      one still of the lit hero, for the landing page's <video poster> and as the
#                                 Instagram cover (the film's own first frame is the hero before its lights)
#
# The three reels are joined with a 0.25 s dip through black at each of the two joins (in and out of the landing
# page), so the hero and the wordmark never ghost over a picture. Every other change in the film is a hard cut,
# made while filming. Both films come from the lossless reels in one pass, so neither is a copy of a copy, and
# both have the same number of frames.
# The films are written under temporary names, check.mjs compares them frame by frame (the cut fails if the framed
# one runs late), and only then are the three files moved into place together: whoever is looking at the films
# never gets a half-written one. Their md5 sums go into take.json.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
OUT="${DEMO_OUT:-$HOME/vibe-demo-video}"
TAKE="$OUT/take"
FF=/opt/homebrew/bin/ffmpeg
[[ -f "$TAKE/take.json" ]] || { echo "no take in $TAKE: run record.mjs first"; exit 1; }
# The films show Franky's own pictures and the repo is public: never write them inside any git work tree.
if git -C "$OUT" rev-parse --is-inside-work-tree >/dev/null 2>&1; then echo "refusing: $OUT is inside a git work tree"; exit 2; fi
cd "$TAKE"

# Where the fades sit: reel b starts FADE before reel a ends, reel c FADE before reel b ends.
read -r FADE X1 X2 FRAMES POSTER <<< "$(node -e 'const t=require("./take.json");const r=Object.fromEntries(t.reels.map(x=>[x.name,x.seconds]));const f=t.fade;console.log(f,(r["a-open"]-f).toFixed(4),(r["a-open"]+r["b-app"]-2*f).toFixed(4),Math.round(t.length*t.fps),(r["a-open"]-f-0.05).toFixed(3))')"

# The frame around the phone screen, drawn once as three still pictures.
W=810; H=1752; R=58          # the screen on the canvas, and its corner radius
PX=$(( (1080 - W) / 2 )); PY=$(( (1920 - H) / 2 ))
# How far a pixel is outside the rounded rectangle (negative inside).
D="(hypot(max(abs(X+0.5-$W/2)-($W/2-$R)\,0)\,max(abs(Y+0.5-$H/2)-($H/2-$R)\,0))-$R)"
# canvas.png: #0C0B0B with the coral #FF5C35 glowing low in the right corner (dithered, so it does not band).
G="(0.16*exp(-((X-1080)*(X-1080)+(Y-1920)*(Y-1920))/(2*360*360)))"
$FF -v error -y -f lavfi -i "color=c=black:s=1080x1920,format=gbrp,geq=r='12+243*$G+random(1)-0.5':g='11+81*$G+random(2)-0.5':b='11+42*$G+random(3)-0.5'" -frames:v 1 canvas.png
# corners.png: white inside the rounded screen, black outside, soft on the edge.
$FF -v error -y -f lavfi -i "color=c=black:s=${W}x${H},format=gray,geq=lum='255*clip(0.5-$D\,0\,1)'" -frames:v 1 corners.png
# border.png: a 1.5 px line just inside that edge, white at 10%.
$FF -v error -y -f lavfi -i "color=c=white:s=${W}x${H},format=gbrap,geq=r=255:g=255:b=255:a='25.5*(clip(0.5-$D\,0\,1)-clip(-1-$D\,0\,1))'" -frames:v 1 border.png

TAGS=(-colorspace bt709 -color_primaries bt709 -color_trc bt709 -movflags +faststart)
# To the delivery format, tagged as what it is (bt709, limited range), so players do not have to guess the colours.
TO_420="scale=out_color_matrix=bt709:out_range=tv,format=yuv420p,setparams=range=tv:colorspace=bt709:color_primaries=bt709:color_trc=bt709"
# -g 1800: keyframes on the hard cuts only (x264 puts one on every scene change). With the default, one landed in
# the middle of the last hold and the dark background pulsed for a frame. The framed film keeps to level 4.2
# (four reference frames), the ceiling of many older phones for 1080p at 60.
# fps=60 on the way in and after the joins: the reels are .mkv, whose frame times are whole milliseconds (0, 17,
# 33, 50 ...). Laid over the canvas, whose times are exact, every third frame arrived "not there yet" and the
# frame before it was shown twice: the framed film stuttered through every scroll. fps=60 puts every frame on
# the exact 1/60 s grid before anything is laid over anything.
$FF -v error -y -i a-open.mkv -i b-app.mkv -i c-close.mkv \
  -loop 1 -framerate 60 -i canvas.png -loop 1 -framerate 60 -i corners.png -loop 1 -framerate 60 -i border.png \
  -filter_complex "
    [0:v]fps=60[a];[1:v]fps=60[b];[2:v]fps=60[c];
    [a][b]xfade=transition=fadeblack:duration=${FADE}:offset=${X1}[ab];
    [ab][c]xfade=transition=fadeblack:duration=${FADE}:offset=${X2},fps=60,split[film][small];
    [film]${TO_420}[master];
    [small]scale=${W}:$(( H + 1 )):flags=lanczos,crop=${W}:${H}:0:0,format=gbrp[screen];
    [4:v]format=gray[mask];
    [screen][mask]alphamerge[rounded];
    [3:v][rounded]overlay=${PX}:${PY}:format=gbrp[on];
    [on][5:v]overlay=${PX}:${PY}:format=gbrp,${TO_420}[framed]" \
  -map "[master]" -an -frames:v "$FRAMES" -c:v libx264 -preset slow -crf 14 -g 1800 -r 60 "${TAGS[@]}" "$OUT/vibe-demo-30s-master.new.mp4" \
  -map "[framed]" -an -frames:v "$FRAMES" -c:v libx264 -preset slow -crf 15 -g 1800 -refs 4 -level:v 4.2 -r 60 "${TAGS[@]}" "$OUT/vibe-demo-30s-1080x1920.new.mp4"

# The poster: the hero with its lights on, just before it fades into the feed.
$FF -v error -y -ss "$POSTER" -i "$OUT/vibe-demo-30s-1080x1920.new.mp4" -frames:v 1 -update 1 -q:v 2 "$OUT/vibe-demo-30s-poster.new.jpg"

# Does the framed film show the same picture as the master on every frame? (Exit 1 and a sentence when not;
# the films already in place are then left alone.)
node "$HERE/check.mjs" "$OUT/vibe-demo-30s-master.new.mp4" "$OUT/vibe-demo-30s-1080x1920.new.mp4"
for f in vibe-demo-30s-master.mp4 vibe-demo-30s-1080x1920.mp4 vibe-demo-30s-poster.jpg; do mv -f "$OUT/${f%.*}.new.${f##*.}" "$OUT/$f"; done
for f in vibe-demo-30s-master.mp4 vibe-demo-30s-1080x1920.mp4; do
  echo "$OUT/$f: $(/opt/homebrew/bin/ffprobe -v error -select_streams v:0 -show_entries stream=codec_name,profile,level,pix_fmt,width,height,r_frame_rate,nb_frames:format=duration -of csv=p=0 "$OUT/$f" | tr '\n' ' ')"
done
# Which films this take made: their md5 sums, in take.json (a review can name the film it judged).
node -e 'const fs=require("fs"),c=require("crypto");const t=JSON.parse(fs.readFileSync("take.json"));t.films={cutAt:new Date().toISOString()};for(const f of process.argv.slice(1))t.films[f.split("/").pop()]=c.createHash("md5").update(fs.readFileSync(f)).digest("hex");fs.writeFileSync("take.json",JSON.stringify(t,null,1));console.log("md5",JSON.stringify(t.films))' "$OUT/vibe-demo-30s-master.mp4" "$OUT/vibe-demo-30s-1080x1920.mp4" "$OUT/vibe-demo-30s-poster.jpg"
