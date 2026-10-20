// Tag the nearest button (selector) around the smallest element whose text contains `text`, inside `root` (page or frame).
export async function tagNear(root, text, buttonSel, tag = "b7-target") {
  return root.evaluate(({ text, buttonSel, tag }) => {
    document.querySelectorAll(`[data-${tag}]`).forEach((el) => el.removeAttribute(`data-${tag}`));
    const all = Array.from(document.querySelectorAll("body *")).filter((el) => (el.textContent || "").includes(text) && el.offsetParent !== null);
    all.sort((a, b) => a.textContent.length - b.textContent.length);
    const leaf = all[0];
    let el = leaf;
    for (let i = 0; i < 8 && el; i++) {
      const b = el.querySelector(buttonSel);
      if (b) { b.setAttribute(`data-${tag}`, ""); return true; }
      el = el.parentElement;
    }
    return false;
  }, { text, buttonSel, tag });
}
