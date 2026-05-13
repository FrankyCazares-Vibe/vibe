// IU Indianapolis major taxonomy mirror for the vanilla profile page.
// Source of truth lives in src/lib/iu/majors.ts; this file is hand-kept
// in sync so the desktop profile editor can populate the same grouped
// <select> the mobile React editor uses.
//
// Anything that doesn't match an option here will still be accepted by
// the server, but it'll fall into the "Other" halo on the campus map
// instead of grouping with a school.

(function () {
  if (window.IU_MAJORS_BY_SCHOOL) return;

  window.IU_MAJORS_BY_SCHOOL = [
    {
      school: { id: "kelley", shortLabel: "Kelley", label: "Kelley · Business" },
      majors: [
        "Accounting",
        "Business",
        "Business Analytics",
        "Economics",
        "Entrepreneurship",
        "Finance",
        "Management",
        "Marketing",
        "Supply Chain Management",
      ],
    },
    {
      school: { id: "oneill", shortLabel: "O'Neill", label: "O'Neill · Public Affairs" },
      majors: [
        "Criminal Justice",
        "Environmental Policy",
        "Environmental Science",
        "Healthcare Management",
        "Nonprofit Management",
        "Public Affairs",
        "Public Policy",
      ],
    },
    {
      school: { id: "luddy", shortLabel: "Luddy", label: "Luddy · Informatics" },
      majors: [
        "Computer Science",
        "Cybersecurity",
        "Data Science",
        "Human-Computer Interaction",
        "Informatics",
        "Media Arts And Science",
      ],
    },
    {
      school: { id: "engtech", shortLabel: "Eng+Tech", label: "Engineering & Technology" },
      majors: [
        "Biomedical Engineering",
        "Computer Engineering",
        "Construction Management",
        "Electrical Engineering",
        "Electrical Engineering Technology",
        "Mechanical Engineering",
        "Mechanical Engineering Technology",
        "Motorsports Engineering",
      ],
    },
    {
      school: { id: "media", shortLabel: "Media", label: "Media School" },
      majors: [
        "Cinema And Media",
        "Communication",
        "Communication Studies",
        "Game Design",
        "Journalism",
        "Media",
        "Sports Communication",
      ],
    },
    {
      school: { id: "liberal", shortLabel: "Liberal", label: "Liberal Arts" },
      majors: [
        "Africana Studies",
        "American Studies",
        "Americansign Language",
        "Anthropology",
        "English",
        "History",
        "International Studies",
        "Philosophy",
        "Political Science",
        "Psychology",
        "Religious Studies",
        "Sociology",
        "World Languages",
      ],
    },
    {
      school: { id: "science", shortLabel: "Science", label: "School of Science" },
      majors: [
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
      ],
    },
    {
      school: { id: "herron", shortLabel: "Herron", label: "Herron · Art + Design" },
      majors: [
        "Art History",
        "Ceramics",
        "Fine Art",
        "Furniture Design",
        "Graphic Design",
        "Photography",
        "Printmaking",
        "Sculpture",
        "Studio Art",
        "Visual Communication Design",
      ],
    },
    {
      school: { id: "health", shortLabel: "Health", label: "Fairbanks Public Health" },
      majors: [
        "Epidemiology",
        "Exercise Science",
        "Health Sciences",
        "Kinesiology",
        "Nutrition",
        "Public Health",
      ],
    },
    {
      school: { id: "nursing", shortLabel: "Nursing", label: "School of Nursing" },
      majors: ["Nursing", "RN-BSN"],
    },
    {
      school: { id: "med", shortLabel: "Med", label: "IU School of Medicine" },
      majors: [
        "Biomedical Sciences",
        "Cytotechnology",
        "Medical Imaging Technology",
        "Radiation Therapy",
      ],
    },
    {
      school: { id: "education", shortLabel: "Educ", label: "School of Education" },
      majors: [
        "Education",
        "Elementary Education",
        "Secondary Education",
        "Special Education",
      ],
    },
  ];
})();
