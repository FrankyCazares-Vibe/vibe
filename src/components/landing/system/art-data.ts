// Made by vibe-marketing/campaigns/2026-11-landing-revamp/board/export.mjs (Nov 23, 2026) from the board Franky
// picked (d.html#fade). Don't edit by hand: change the board's export.html and run it again.
// Each piece of art is drawn in a fixed box (w x h px, at the desktop or phone layout); its SVG's viewBox is
// "view" ([x, y, width, height] in the same px), which runs past the box where the handwriting does.

/** Each SVG's box and viewBox, per layout. */
export const ART = {
  "hero": {
    "desktop": {
      "w": 1000,
      "h": 900,
      "view": [
        0,
        0,
        1000,
        900
      ]
    },
    "phone": {
      "w": 390,
      "h": 430,
      "view": [
        0,
        0,
        390,
        430
      ]
    }
  },
  "people": {
    "desktop": {
      "w": 640,
      "h": 640,
      "view": [
        -59,
        0,
        699,
        640
      ]
    },
    "phone": {
      "w": 390,
      "h": 380,
      "view": [
        0,
        0,
        392,
        380
      ]
    }
  },
  "eyes-window": {
    "desktop": {
      "w": 540,
      "h": 675,
      "view": [
        -69,
        -69,
        609,
        744
      ]
    },
    "phone": {
      "w": 342,
      "h": 428,
      "view": [
        -46,
        -46,
        388,
        474
      ]
    }
  },
  "eyes-note": {
    "desktop": {
      "w": 540,
      "h": 675,
      "view": [
        0,
        0,
        540,
        675
      ]
    },
    "phone": {
      "w": 342,
      "h": 428,
      "view": [
        0,
        0,
        342,
        428
      ]
    }
  },
  "open": {
    "desktop": {
      "w": 600,
      "h": 360,
      "view": [
        -68,
        0,
        668,
        360
      ]
    },
    "phone": {
      "w": 342,
      "h": 240,
      "view": [
        -54,
        0,
        397,
        240
      ]
    }
  },
  "close-back": {
    "desktop": {
      "w": 438,
      "h": 220,
      "view": [
        0,
        -15,
        597,
        364
      ]
    },
    "phone": {
      "w": 199,
      "h": 100,
      "view": [
        0,
        -24,
        288,
        200
      ]
    }
  },
  "close-front": {
    "desktop": {
      "w": 438,
      "h": 220,
      "view": [
        0,
        0,
        597,
        239
      ]
    },
    "phone": {
      "w": 199,
      "h": 100,
      "view": [
        0,
        0,
        278,
        114
      ]
    }
  }
} as const;

/** Positions the page needs besides the art (fractions of each box). */
export const ART_EXTRA = {
  "hero": {
    "desktop": {
      "w": 1000,
      "h": 900,
      "s": 0.6,
      "ax": 0.55,
      "ay": 0.6,
      "g": 5.6,
      "rx": 350,
      "ry": 410,
      "sun": [
        0.9,
        0.12,
        19
      ]
    },
    "phone": {
      "w": 390,
      "h": 430,
      "s": 0.3,
      "ax": 0.42,
      "ay": 0.56,
      "g": 3.9,
      "rx": 160,
      "ry": 190,
      "sun": [
        0.87,
        0.12,
        11
      ]
    }
  },
  "planet": {
    "desktop": [
      0.03125,
      -0.171875,
      1
    ],
    "phone": [
      -0.015384615384615385,
      -0.15789473684210525,
      1.0769230769230769
    ],
    "youA": 0.62
  },
  "window": {
    "cx": 0.08518518518518518,
    "cy": 0.06806853582554517,
    "r": 0.15555555555555553,
    "otto": [
      -0.011259259259259245,
      0.028292834890965738,
      0.19288888888888886
    ]
  },
  "close": {
    "desktop": {
      "F": 220,
      "w": 438,
      "h": 220
    },
    "phone": {
      "F": 100,
      "w": 199,
      "h": 100
    }
  }
} as const;

/** Source sizes (px) of the photos and screens. */
export const ART_DIMS = {"otto":[520,317],"eyes":[1080,1350]} as const;
