// Made by vibe-marketing/campaigns/2026-11-landing-revamp/board/export.mjs (Nov 23, 2026) from the board Franky
// picked (d.html#fade). Don't edit by hand: change the board's export.html and run it again.
// Each piece of art is drawn in a fixed box (w x h px, at the desktop or phone layout); its SVG's viewBox is
// "view" ([x, y, width, height] in the same px), which runs past the box where the handwriting does.

/** Each SVG's box and viewBox, per layout. */
export const ART = {
  "hero": {
    "desktop": {
      "w": 880,
      "h": 800,
      "view": [
        0,
        0,
        880,
        800
      ]
    },
    "phone": {
      "w": 390,
      "h": 380,
      "view": [
        0,
        0,
        390,
        380
      ]
    }
  },
  "people": {
    "desktop": {
      "w": 640,
      "h": 640,
      "view": [
        -59,
        -16,
        726,
        656
      ]
    },
    "phone": {
      "w": 390,
      "h": 380,
      "view": [
        0,
        -40,
        394,
        420
      ]
    }
  },
  "club": {
    "desktop": {
      "w": 640,
      "h": 700,
      "view": [
        -33,
        -20,
        673,
        739
      ]
    },
    "phone": {
      "w": 342,
      "h": 470,
      "view": [
        -33,
        -33,
        415,
        503
      ]
    }
  },
  "num1": {
    "desktop": {
      "w": 34,
      "h": 34,
      "view": [
        -14,
        -14,
        64,
        63
      ]
    },
    "phone": {
      "w": 34,
      "h": 34,
      "view": [
        -12,
        -11,
        59,
        57
      ]
    }
  },
  "num2": {
    "desktop": {
      "w": 34,
      "h": 34,
      "view": [
        -16,
        -13,
        66,
        62
      ]
    },
    "phone": {
      "w": 34,
      "h": 34,
      "view": [
        -13,
        -10,
        60,
        55
      ]
    }
  },
  "num3": {
    "desktop": {
      "w": 34,
      "h": 34,
      "view": [
        -16,
        -14,
        67,
        62
      ]
    },
    "phone": {
      "w": 34,
      "h": 34,
      "view": [
        -12,
        -11,
        60,
        56
      ]
    }
  },
  "eyes-band": {
    "desktop": {
      "w": 540,
      "h": 675,
      "view": [
        -10,
        -10,
        560,
        695
      ]
    },
    "phone": {
      "w": 342,
      "h": 428,
      "view": [
        -10,
        -10,
        362,
        448
      ]
    }
  },
  "eyes-ink": {
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
        398,
        240
      ]
    }
  },
  "close": {
    "desktop": {
      "w": 438,
      "h": 220,
      "view": [
        0,
        0,
        610,
        369
      ]
    },
    "phone": {
      "w": 199,
      "h": 100,
      "view": [
        0,
        -15,
        285,
        201
      ]
    }
  }
} as const;

/** Positions the page needs besides the art (fractions of each box). */
export const ART_EXTRA = {
  "sun": {
    "desktop": [
      0.885,
      0.12,
      17
    ],
    "phone": [
      0.87,
      0.14,
      10
    ]
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
    ]
  },
  "band": {
    "corners": [
      [
        0.23763196961007327,
        0.4602444801538963
      ],
      [
        0.46027358858453726,
        0.1964891465178102
      ],
      [
        0.5623680303899267,
        0.2515156444566956
      ],
      [
        0.3397264114154626,
        0.5152709780927817
      ]
    ],
    "otto": [
      0.29060185185185183,
      0.270622158069734,
      0.2586111111111111
    ]
  },
  "close": {
    "desktop": {
      "F": 220,
      "w": 438.140625,
      "h": 220
    },
    "phone": {
      "F": 100,
      "w": 199.15625,
      "h": 100
    }
  }
} as const;

/** Source sizes (px) of the photos and screens. */
export const ART_DIMS = {"screenPage":[700,1316],"screenBoard":[700,778],"screenChat":[700,1316],"otto":[520,317],"eyes":[1080,1350]} as const;
