// GENERATED from src/lib/iu/majors.ts (+ majors-purdue-indianapolis.ts and
// majors-bloomington.ts). Do not hand-edit: src/lib/iu/majors.test.ts fails
// when this file drifts. Regenerate with:
//   VIBE_REGEN_MAJORS=1 node --test --experimental-strip-types src/lib/iu/majors.test.ts
//
// window.IU_MAJORS_BY_SCHOOL
//   Legacy grouped IU Indianapolis list (the desktop profile editor's
//   <select>). Same shape as before.
// window.VIBE_MAJOR_LISTS
//   The curated lists: iuIndianapolis, purdueIndianapolis, iuBloomington.
//   Each is { label, schools, majors, groups }.
// window.vibeMajorsForCampus(campusId, system)
//   Same routing as majorsForCampus() in majors.ts: a fresh copy of the list,
//   or null (free text) when the campus has no curated list.
//
// Anything that doesn't match an option here is still accepted by the
// server; it just falls into the "Other" halo on the campus map.

(function () {
  if (window.IU_MAJORS_BY_SCHOOL) return;

  const LISTS = {
    "iuIndianapolis": {
      "label": "IU Indianapolis",
      "schools": [
        "Kelley · Business",
        "O'Neill · Public Affairs",
        "Luddy · Informatics",
        "Media School",
        "Liberal Arts",
        "School of Science",
        "Herron · Art + Design",
        "Fairbanks Public Health",
        "School of Nursing",
        "IU School of Medicine",
        "School of Education"
      ],
      "majors": [
        "Accounting",
        "Africana Studies",
        "American Sign Language",
        "American Studies",
        "Anthropology",
        "Art History",
        "Biochemistry",
        "Biology",
        "Biomedical Sciences",
        "Business",
        "Business Analytics",
        "Ceramics",
        "Chemistry",
        "Cinema and Media",
        "Communication",
        "Communication Studies",
        "Computer Science",
        "Criminal Justice",
        "Cybersecurity",
        "Cytotechnology",
        "Data Science",
        "Earth Sciences",
        "Economics",
        "Education",
        "Elementary Education",
        "English",
        "Entrepreneurship",
        "Environmental Policy",
        "Environmental Science",
        "Epidemiology",
        "Exercise Science",
        "Finance",
        "Fine Art",
        "Forensic and Investigative Sciences",
        "Furniture Design",
        "Game Design",
        "Geology",
        "Graphic Design",
        "Health Sciences",
        "Healthcare Management",
        "History",
        "Human-Computer Interaction",
        "Informatics",
        "International Studies",
        "Journalism",
        "Kinesiology",
        "Management",
        "Marketing",
        "Math",
        "Mathematics",
        "Media",
        "Media Arts and Science",
        "Medical Imaging Technology",
        "Neuroscience",
        "Nonprofit Management",
        "Nursing",
        "Nutrition",
        "Philosophy",
        "Photography",
        "Physics",
        "Political Science",
        "Printmaking",
        "Psychology",
        "Public Affairs",
        "Public Health",
        "Public Policy",
        "Radiation Therapy",
        "Religious Studies",
        "RN-BSN",
        "Sculpture",
        "Secondary Education",
        "Sociology",
        "Special Education",
        "Sports Communication",
        "Studio Art",
        "Supply Chain Management",
        "Visual Communication Design",
        "World Languages"
      ],
      "groups": [
        {
          "school": {
            "id": "kelley",
            "label": "Kelley · Business",
            "shortLabel": "Kelley",
            "color": "#C62828"
          },
          "majors": [
            "Accounting",
            "Business",
            "Business Analytics",
            "Economics",
            "Entrepreneurship",
            "Finance",
            "Management",
            "Marketing",
            "Supply Chain Management"
          ]
        },
        {
          "school": {
            "id": "oneill",
            "label": "O'Neill · Public Affairs",
            "shortLabel": "O'Neill",
            "color": "#0EA5E9"
          },
          "majors": [
            "Criminal Justice",
            "Environmental Policy",
            "Environmental Science",
            "Healthcare Management",
            "Nonprofit Management",
            "Public Affairs",
            "Public Policy"
          ]
        },
        {
          "school": {
            "id": "luddy",
            "label": "Luddy · Informatics",
            "shortLabel": "Luddy",
            "color": "#4A90E2"
          },
          "majors": [
            "Computer Science",
            "Cybersecurity",
            "Data Science",
            "Human-Computer Interaction",
            "Informatics",
            "Media Arts and Science"
          ]
        },
        {
          "school": {
            "id": "media",
            "label": "Media School",
            "shortLabel": "Media",
            "color": "#E879A6"
          },
          "majors": [
            "Cinema and Media",
            "Communication",
            "Communication Studies",
            "Game Design",
            "Journalism",
            "Media",
            "Sports Communication"
          ]
        },
        {
          "school": {
            "id": "liberal",
            "label": "Liberal Arts",
            "shortLabel": "Liberal",
            "color": "#6FBF73"
          },
          "majors": [
            "Africana Studies",
            "American Sign Language",
            "American Studies",
            "Anthropology",
            "English",
            "History",
            "International Studies",
            "Philosophy",
            "Political Science",
            "Religious Studies",
            "Sociology",
            "World Languages"
          ]
        },
        {
          "school": {
            "id": "science",
            "label": "School of Science",
            "shortLabel": "Science",
            "color": "#10B981"
          },
          "majors": [
            "Biochemistry",
            "Biology",
            "Chemistry",
            "Earth Sciences",
            "Forensic and Investigative Sciences",
            "Geology",
            "Math",
            "Mathematics",
            "Neuroscience",
            "Physics",
            "Psychology"
          ]
        },
        {
          "school": {
            "id": "herron",
            "label": "Herron · Art + Design",
            "shortLabel": "Herron",
            "color": "#F59E0B"
          },
          "majors": [
            "Art History",
            "Ceramics",
            "Fine Art",
            "Furniture Design",
            "Graphic Design",
            "Photography",
            "Printmaking",
            "Sculpture",
            "Studio Art",
            "Visual Communication Design"
          ]
        },
        {
          "school": {
            "id": "health",
            "label": "Fairbanks Public Health",
            "shortLabel": "Health",
            "color": "#14B8A6"
          },
          "majors": [
            "Epidemiology",
            "Exercise Science",
            "Health Sciences",
            "Kinesiology",
            "Nutrition",
            "Public Health"
          ]
        },
        {
          "school": {
            "id": "nursing",
            "label": "School of Nursing",
            "shortLabel": "Nursing",
            "color": "#06B6D4"
          },
          "majors": [
            "Nursing",
            "RN-BSN"
          ]
        },
        {
          "school": {
            "id": "med",
            "label": "IU School of Medicine",
            "shortLabel": "Med",
            "color": "#DC2626"
          },
          "majors": [
            "Biomedical Sciences",
            "Cytotechnology",
            "Medical Imaging Technology",
            "Radiation Therapy"
          ]
        },
        {
          "school": {
            "id": "education",
            "label": "School of Education",
            "shortLabel": "Educ",
            "color": "#F97316"
          },
          "majors": [
            "Education",
            "Elementary Education",
            "Secondary Education",
            "Special Education"
          ]
        }
      ]
    },
    "purdueIndianapolis": {
      "label": "Purdue Indianapolis",
      "schools": [
        "College of Engineering",
        "Purdue Polytechnic Institute",
        "College of Science",
        "Daniels School of Business",
        "College of Health and Human Sciences",
        "Exploratory Studies"
      ],
      "majors": [
        "Actuarial Science",
        "Artificial Intelligence",
        "Biomedical Engineering",
        "Business Analytics and Information Management",
        "Computer and Information Technology",
        "Computer Engineering",
        "Computer Science",
        "Construction Management",
        "Cybersecurity",
        "Data Science",
        "Electrical Engineering",
        "Exploratory Pre-medicine and Health",
        "Hospitality and Tourism Management",
        "Industrial Engineering",
        "Integrated Business and Engineering",
        "Integrated Science and Business: Applied Statistics",
        "Interior Architecture",
        "Mechanical Engineering",
        "Motorsports Engineering",
        "Multidisciplinary Technology",
        "Themed Entertainment Design"
      ],
      "groups": [
        {
          "school": {
            "id": "purdue-engineering",
            "label": "College of Engineering",
            "shortLabel": "Engineering",
            "color": "#B8860B"
          },
          "majors": [
            "Biomedical Engineering",
            "Computer Engineering",
            "Electrical Engineering",
            "Industrial Engineering",
            "Mechanical Engineering",
            "Motorsports Engineering"
          ]
        },
        {
          "school": {
            "id": "purdue-polytechnic",
            "label": "Purdue Polytechnic Institute",
            "shortLabel": "Polytechnic",
            "color": "#EAB308"
          },
          "majors": [
            "Computer and Information Technology",
            "Construction Management",
            "Cybersecurity",
            "Interior Architecture",
            "Multidisciplinary Technology",
            "Themed Entertainment Design"
          ]
        },
        {
          "school": {
            "id": "purdue-science",
            "label": "College of Science",
            "shortLabel": "Science",
            "color": "#65A30D"
          },
          "majors": [
            "Actuarial Science",
            "Artificial Intelligence",
            "Computer Science",
            "Data Science",
            "Integrated Science and Business: Applied Statistics"
          ]
        },
        {
          "school": {
            "id": "purdue-business",
            "label": "Daniels School of Business",
            "shortLabel": "Daniels",
            "color": "#D946EF"
          },
          "majors": [
            "Business Analytics and Information Management",
            "Integrated Business and Engineering"
          ]
        },
        {
          "school": {
            "id": "purdue-hhs",
            "label": "College of Health and Human Sciences",
            "shortLabel": "HHS",
            "color": "#9A3412"
          },
          "majors": [
            "Hospitality and Tourism Management"
          ]
        },
        {
          "school": {
            "id": "purdue-exploratory",
            "label": "Exploratory Studies",
            "shortLabel": "Exploratory",
            "color": "#64748B"
          },
          "majors": [
            "Exploratory Pre-medicine and Health"
          ]
        }
      ]
    },
    "iuBloomington": {
      "label": "IU Bloomington",
      "schools": [
        "College of Arts and Sciences",
        "Eskenazi School of Art, Architecture + Design",
        "Hamilton Lugar School of Global and International Studies",
        "Hutton Honors College",
        "Jacobs School of Music",
        "Kelley School of Business",
        "Luddy School of Informatics, Computing, and Engineering",
        "Maurer School of Law",
        "O'Neill School of Public and Environmental Affairs",
        "School of Education",
        "School of Nursing",
        "School of Optometry",
        "School of Public Health",
        "School of Social Work",
        "The Media School",
        "University Graduate School",
        "Department of African American and African Diaspora Studies",
        "Department of American Studies",
        "Department of Anthropology",
        "Department of Astronomy",
        "Department of Biology",
        "Department of Central Eurasian Studies",
        "Department of Chemistry",
        "Department of Classical Studies",
        "Department of Cognitive Science",
        "Department of Communication Sciences and Disorders",
        "Department of Comparative Literature",
        "Department of Computer Science",
        "Department of Criminal Justice",
        "Department of Earth and Atmospheric Sciences",
        "Department of East Asian Languages and Cultures",
        "Department of Economics",
        "Department of English",
        "Department of Folklore and Ethnomusicology",
        "Department of French and Italian",
        "Department of Gender Studies",
        "Department of Geography",
        "Department of Germanic Studies",
        "Department of History",
        "Department of History and Philosophy of Science and Medicine",
        "Department of History of Art",
        "Department of International Studies",
        "Department of Kinesiology",
        "Department of Linguistics",
        "Department of Mathematics",
        "Department of Middle Eastern Languages and Cultures",
        "Department of Near Eastern Languages and Cultures",
        "Department of Philosophy",
        "Department of Physics",
        "Department of Political Science",
        "Department of Psychological and Brain Sciences",
        "Department of Religious Studies",
        "Department of Second Language Studies",
        "Department of Slavic and East European Languages and Cultures",
        "Department of Sociology",
        "Department of Spanish and Portuguese",
        "Department of Speech, Language and Hearing Sciences",
        "Department of Statistics",
        "Department of Theatre, Drama, and Contemporary Dance"
      ],
      "majors": [
        "Undecided / Exploratory",
        "Accounting",
        "Adaptive Sport",
        "African American and African Diaspora Studies",
        "African Studies",
        "American Studies",
        "Animal Behavior",
        "Anthropology",
        "Apparel Merchandising",
        "Applied Sciences",
        "Arabic",
        "Architectural Studies",
        "Art History",
        "Asian American Studies",
        "Astronomy and Astrophysics",
        "Audio Engineering and Sound Production",
        "Ballet",
        "Biochemistry",
        "Biology",
        "Biophysics",
        "Biotechnology",
        "Business Analytics",
        "Business Management",
        "Business Marketing",
        "Business of Music",
        "Central Eurasian Studies",
        "Chemistry",
        "Chinese",
        "Cinema and Media Arts",
        "Classical Civilization",
        "Cognitive Science",
        "Communication and Public Advocacy",
        "Communication Sciences and Disorders",
        "Comparative Literature",
        "Composition (Music)",
        "Computer Engineering",
        "Computer Science",
        "Contemporary Dance",
        "Criminal Justice",
        "Cybersecurity and Global Policy",
        "Data Science",
        "Direct Admit Kelley",
        "East Asian Languages and Cultures",
        "Earth and Atmospheric Sciences",
        "Economic Consulting",
        "Economics",
        "Education (Elementary)",
        "Education (Secondary)",
        "Education (Special)",
        "English",
        "Entrepreneurship and Corporate Innovation",
        "Environmental and Sustainability Studies",
        "Environmental Science",
        "Epidemiology",
        "Exercise Science",
        "Fashion Design",
        "Finance",
        "Folklore and Ethnomusicology",
        "French",
        "Game Design",
        "Gender Studies",
        "Geography",
        "Geological Sciences",
        "Germanic Studies",
        "Graphic Design",
        "Health and Wellness Design",
        "Hebrew",
        "Hispanic Linguistics",
        "Historic Preservation",
        "History",
        "History of Art",
        "Human Biology",
        "Human-Centered Computing",
        "Human Development and Family Studies",
        "Individualized Major",
        "Informatics",
        "Information Systems",
        "Intelligent Systems Engineering",
        "International Business",
        "International Law and Institutions",
        "International Studies",
        "Italian",
        "Japanese",
        "Jazz Studies",
        "Jewish Studies",
        "Journalism",
        "Kelley Honors",
        "Kinesiology",
        "Korean",
        "Labor Studies",
        "Latin",
        "Latin American and Caribbean Studies",
        "Latino Studies",
        "Law and Public Policy",
        "Linguistics",
        "Liberal Studies",
        "Management",
        "Marketing",
        "Mathematics",
        "Media (Advertising)",
        "Media (Game Design)",
        "Media (Production)",
        "Media (Sports Reporting)",
        "Medieval Studies",
        "Microbiology",
        "Middle Eastern Languages and Cultures",
        "Music (BM)",
        "Music Composition",
        "Music Education",
        "Music Performance",
        "Music Theory",
        "Musical Theatre",
        "Neuroscience",
        "Nonprofit Management",
        "Nursing (BSN)",
        "Nutrition and Dietetics",
        "Operations Management",
        "Painting",
        "Philosophy",
        "Photography",
        "Physics",
        "Piano",
        "Political Science",
        "Polish Studies",
        "Portuguese",
        "Pre-Dentistry",
        "Pre-Law",
        "Pre-Medicine",
        "Pre-Optometry",
        "Pre-Pharmacy",
        "Pre-Physical Therapy",
        "Pre-Veterinary",
        "Professional Sales",
        "Psychology",
        "Public Affairs",
        "Public Financial Management",
        "Public Health (BSPH)",
        "Public Policy Analysis",
        "Real Estate",
        "Recreational Sport Management",
        "Religious Studies",
        "Russian and Eastern European Studies",
        "Russian Language",
        "Sculpture",
        "Slavic Languages and Literatures",
        "Social Studies Education",
        "Social Work",
        "Sociology",
        "Spanish",
        "Speech and Hearing Sciences",
        "Sport Marketing and Management",
        "Statistics",
        "Studio Art",
        "Supply Chain Management",
        "Sustainable Business",
        "Telecommunications",
        "Theatre and Drama",
        "Therapeutic Recreation",
        "Tourism, Hospitality and Event Management",
        "Urban Planning and Community Development",
        "Voice (Music)",
        "Women's Studies",
        "Youth Development"
      ],
      "groups": []
    }
  };

  function copyList(list) {
    return JSON.parse(JSON.stringify(list));
  }

  window.IU_MAJORS_BY_SCHOOL = [
    {
      "school": {
        "id": "kelley",
        "shortLabel": "Kelley",
        "label": "Kelley · Business"
      },
      "majors": [
        "Accounting",
        "Business",
        "Business Analytics",
        "Economics",
        "Entrepreneurship",
        "Finance",
        "Management",
        "Marketing",
        "Supply Chain Management"
      ]
    },
    {
      "school": {
        "id": "oneill",
        "shortLabel": "O'Neill",
        "label": "O'Neill · Public Affairs"
      },
      "majors": [
        "Criminal Justice",
        "Environmental Policy",
        "Environmental Science",
        "Healthcare Management",
        "Nonprofit Management",
        "Public Affairs",
        "Public Policy"
      ]
    },
    {
      "school": {
        "id": "luddy",
        "shortLabel": "Luddy",
        "label": "Luddy · Informatics"
      },
      "majors": [
        "Computer Science",
        "Cybersecurity",
        "Data Science",
        "Human-Computer Interaction",
        "Informatics",
        "Media Arts And Science"
      ]
    },
    {
      "school": {
        "id": "engtech",
        "shortLabel": "Eng+Tech",
        "label": "Engineering & Technology"
      },
      "majors": [
        "Biomedical Engineering",
        "Computer Engineering",
        "Construction Management",
        "Electrical Engineering",
        "Electrical Engineering Technology",
        "Mechanical Engineering",
        "Mechanical Engineering Technology",
        "Motorsports Engineering"
      ]
    },
    {
      "school": {
        "id": "media",
        "shortLabel": "Media",
        "label": "Media School"
      },
      "majors": [
        "Cinema And Media",
        "Communication",
        "Communication Studies",
        "Game Design",
        "Journalism",
        "Media",
        "Sports Communication"
      ]
    },
    {
      "school": {
        "id": "liberal",
        "shortLabel": "Liberal",
        "label": "Liberal Arts"
      },
      "majors": [
        "Africana Studies",
        "American Sign Language",
        "American Studies",
        "Anthropology",
        "English",
        "History",
        "International Studies",
        "Philosophy",
        "Political Science",
        "Religious Studies",
        "Sociology",
        "World Languages"
      ]
    },
    {
      "school": {
        "id": "science",
        "shortLabel": "Science",
        "label": "School of Science"
      },
      "majors": [
        "Biochemistry",
        "Biology",
        "Chemistry",
        "Earth Sciences",
        "Forensic And Investigative Sciences",
        "Geology",
        "Math",
        "Mathematics",
        "Neuroscience",
        "Physics",
        "Psychology"
      ]
    },
    {
      "school": {
        "id": "herron",
        "shortLabel": "Herron",
        "label": "Herron · Art + Design"
      },
      "majors": [
        "Art History",
        "Ceramics",
        "Fine Art",
        "Furniture Design",
        "Graphic Design",
        "Photography",
        "Printmaking",
        "Sculpture",
        "Studio Art",
        "Visual Communication Design"
      ]
    },
    {
      "school": {
        "id": "health",
        "shortLabel": "Health",
        "label": "Fairbanks Public Health"
      },
      "majors": [
        "Epidemiology",
        "Exercise Science",
        "Health Sciences",
        "Kinesiology",
        "Nutrition",
        "Public Health"
      ]
    },
    {
      "school": {
        "id": "nursing",
        "shortLabel": "Nursing",
        "label": "School of Nursing"
      },
      "majors": [
        "Nursing",
        "RN-BSN"
      ]
    },
    {
      "school": {
        "id": "med",
        "shortLabel": "Med",
        "label": "IU School of Medicine"
      },
      "majors": [
        "Biomedical Sciences",
        "Cytotechnology",
        "Medical Imaging Technology",
        "Radiation Therapy"
      ]
    },
    {
      "school": {
        "id": "education",
        "shortLabel": "Educ",
        "label": "School of Education"
      },
      "majors": [
        "Education",
        "Elementary Education",
        "Secondary Education",
        "Special Education"
      ]
    }
  ];

  window.VIBE_MAJOR_LISTS = LISTS;

  window.vibeMajorsForCampus = function (campusId, system) {
    const id = String(campusId == null ? "" : campusId).trim().toLowerCase();
    if (id === "indianapolis") {
      if (system === "iu") return copyList(LISTS.iuIndianapolis);
      if (system === "purdue") return copyList(LISTS.purdueIndianapolis);
      return null;
    }
    if (id === "iu-bloomington" && system === "iu") {
      return copyList(LISTS.iuBloomington);
    }
    return null;
  };
})();
