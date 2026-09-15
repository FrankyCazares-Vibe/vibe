// IU Bloomington — curated major list + schools/colleges/departments list.
// Data only; routing lives in majors.ts (majorsForCampus).
//
// Copied verbatim (same entries, same order) from the inline arrays in
// public/html/onboarding.html (IU_MAJORS and IU_SCHOOLS, lines 589-687 at
// 13b3176). onboarding.html keeps its own copy until the wave-3 rewrite
// reads this list through public/html/_iu-majors.js.
//
// Unlike the Indianapolis lists, Bloomington majors are not grouped by
// school, so schoolForMajorIn() returns "Other" for them. Users can still
// type any major freely.

export const BLOOMINGTON_MAJORS: string[] = [
  "Undecided / Exploratory",
  "Accounting",
  "Adaptive Sport","African American and African Diaspora Studies","African Studies","American Studies","Animal Behavior","Anthropology","Apparel Merchandising","Applied Sciences",
  "Arabic","Architectural Studies","Art History","Asian American Studies","Astronomy and Astrophysics","Audio Engineering and Sound Production","Ballet",
  "Biochemistry","Biology","Biophysics","Biotechnology","Business Analytics","Business Management","Business Marketing","Business of Music",
  "Central Eurasian Studies","Chemistry","Chinese","Cinema and Media Arts","Classical Civilization","Cognitive Science","Communication and Public Advocacy","Communication Sciences and Disorders",
  "Comparative Literature","Composition (Music)","Computer Engineering","Computer Science","Contemporary Dance","Criminal Justice","Cybersecurity and Global Policy",
  "Data Science","Direct Admit Kelley","East Asian Languages and Cultures","Earth and Atmospheric Sciences","Economic Consulting","Economics","Education (Elementary)","Education (Secondary)","Education (Special)",
  "English","Entrepreneurship and Corporate Innovation","Environmental and Sustainability Studies","Environmental Science","Epidemiology","Exercise Science","Fashion Design","Finance",
  "Folklore and Ethnomusicology","French","Game Design","Gender Studies","Geography","Geological Sciences","Germanic Studies","Graphic Design",
  "Health and Wellness Design","Hebrew","Hispanic Linguistics","Historic Preservation","History","History of Art","Human Biology","Human-Centered Computing","Human Development and Family Studies",
  "Individualized Major","Informatics","Information Systems","Intelligent Systems Engineering","International Business","International Law and Institutions","International Studies","Italian",
  "Japanese","Jazz Studies","Jewish Studies","Journalism","Kelley Honors","Kinesiology","Korean","Labor Studies","Latin","Latin American and Caribbean Studies","Latino Studies","Law and Public Policy","Linguistics",
  "Liberal Studies","Management","Marketing","Mathematics","Media (Advertising)","Media (Game Design)","Media (Production)","Media (Sports Reporting)",
  "Medieval Studies","Microbiology","Middle Eastern Languages and Cultures","Music (BM)","Music Composition","Music Education","Music Performance","Music Theory","Musical Theatre",
  "Neuroscience","Nonprofit Management","Nursing (BSN)","Nutrition and Dietetics","Operations Management","Painting","Philosophy","Photography","Physics","Piano","Political Science","Polish Studies",
  "Portuguese","Pre-Dentistry","Pre-Law","Pre-Medicine","Pre-Optometry","Pre-Pharmacy","Pre-Physical Therapy","Pre-Veterinary","Professional Sales","Psychology","Public Affairs","Public Financial Management","Public Health (BSPH)","Public Policy Analysis",
  "Real Estate","Recreational Sport Management","Religious Studies","Russian and Eastern European Studies","Russian Language","Sculpture","Slavic Languages and Literatures","Social Studies Education","Social Work","Sociology",
  "Spanish","Speech and Hearing Sciences","Sport Marketing and Management","Statistics","Studio Art","Supply Chain Management","Sustainable Business",
  "Telecommunications","Theatre and Drama","Therapeutic Recreation","Tourism, Hospitality and Event Management","Urban Planning and Community Development","Voice (Music)","Women's Studies","Youth Development",
];

export const BLOOMINGTON_SCHOOLS: string[] = [
  // Schools and colleges first — most students identify with these.
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
  // Common departments (mostly under the College of Arts and Sciences).
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
  "Department of Theatre, Drama, and Contemporary Dance",
];
