// =============================================================
//  timetable.js — Jake's school timetable (Vaayu 9 IGCSE), pure data.
//  Days use JS getDay() numbers (1 = Monday … 5 = Friday).
//  Each block: [start, end, subject]. kind "break" = breakfast/lunch/windup.
//  To update: edit the rows below and bump ?v= on the import in app.js.
// =============================================================
const B = (s, e, name) => [s, e, name, "break"];
const BREAKFAST = B("09:10", "10:00", "Breakfast & circle time");
const LUNCH = B("12:00", "12:30", "Lunch");
const WINDUP = B("14:25", "14:50", "School windup");

export const TIMETABLE = {
  1: [["07:50", "09:10", "History"], BREAKFAST, ["10:00", "11:20", "Math"], ["11:20", "12:00", "English"], LUNCH,
      ["12:30", "13:10", "Biology"], ["13:10", "14:25", "Vaayu S"], WINDUP],
  2: [["07:50", "09:10", "EM"], BREAKFAST, ["10:00", "11:20", "Math"], ["11:20", "12:00", "Arts"], LUNCH,
      ["12:30", "13:10", "CSE"], ["13:10", "13:50", "Physics"], ["13:50", "14:25", "Library"], WINDUP],
  3: [["07:50", "09:10", "English"], BREAKFAST, ["10:00", "10:40", "CT"], ["10:40", "11:20", "Arts"], ["11:20", "12:00", "Fitness"], LUNCH,
      ["12:30", "13:50", "Chemistry"], ["13:50", "14:25", "Enrichment"], WINDUP],
  4: [["07:50", "09:10", "History"], BREAKFAST, ["10:00", "11:20", "English"], ["11:20", "12:00", "EM"], LUNCH,
      ["12:30", "13:50", "Math"], ["13:50", "14:25", "Chemistry"], WINDUP],
  5: [["07:50", "08:30", "History"], ["08:30", "09:10", "Enrichment"], BREAKFAST, ["10:00", "11:20", "Physics"], ["11:20", "12:00", "Fitness"], LUNCH,
      ["12:30", "13:50", "Biology"], ["13:50", "14:25", "DDD"], WINDUP],
};
export const SCHOOL_HOURS = ["07:50", "14:50"];
