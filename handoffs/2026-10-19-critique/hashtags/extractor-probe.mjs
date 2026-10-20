import { extractPostTags } from "/Users/franciscocazares/vibe/src/lib/posts/edit.ts";
import { captionHashtags } from "/Users/franciscocazares/vibe/src/lib/posts/caption-tags.ts";
// desktop profile.html extractor (copied regex, line 6780)
const PROFILE_RE = /(?:^|\s)#([\p{L}0-9_]{2,32})/gu;
function profileExtract(text){const out=[];const seen=new Set();let m;PROFILE_RE.lastIndex=0;while((m=PROFILE_RE.exec(text||''))!==null){const t=m[1].toLowerCase();if(seen.has(t))continue;seen.add(t);out.push(t);if(out.length>=10)break;}return out;}
// server keep rule
const KEEP = /^[a-z0-9_]{1,32}$/;
const serverKeep = (arr) => { const out=[]; for (const e of arr){const t=e.trim().toLowerCase().replace(/^#+/,""); if(!KEEP.test(t)||out.includes(t)) continue; out.push(t); if(out.length>=10) break;} return out; };
// inline caption linker regex (campus-home 7944 / PostViewerMobile 1686)
const INLINE = /(^|[^A-Za-z0-9_@#])([@#][A-Za-z0-9_]{1,32})/g;
const inline = (t) => [...t.matchAll(INLINE)].map(m=>m[2]).filter(x=>x[0]==="#");
const cases = {
  long40: "#" + "a".repeat(40),
  cafe: "coffee at #café today",
  eleven: Array.from({length:12},(_,i)=>"#t"+(i+1)).join(" "),
  glued: "hello#world",
  single: "#a party",
  doublehash: "##hype",
  punct: "#gameday! #IU-Football",
  upper: "#GameDay #gameday",
  emojiTag: "#🔥 #fire🔥",
  url: "see https://x.com/page#section",
  numeric: "#2026 #1",
};
for (const [k, v] of Object.entries(cases)) {
  const phone = extractPostTags(v);
  const prof = profileExtract(v);
  console.log(JSON.stringify({ case: k, text: v.length > 60 ? v.slice(0,60)+"…" : v,
    phone_and_desktopFeed_stored: serverKeep(phone),
    desktopProfile_sent: prof, desktopProfile_stored: serverKeep(prof),
    inline_linked: inline(v), wordFilter_checked: captionHashtags(v) }));
}
