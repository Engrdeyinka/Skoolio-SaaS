import { getLagosDateParts } from "@/lib/timezone";

const QUOTES_BY_ROLE = {
  admin: [
    { quote: "Well done is better than well said.", author: "Benjamin Franklin", focus: "Close one open task today rather than planning another." },
    { quote: "The secret of getting ahead is getting started.", author: "Mark Twain", focus: "Pick the thing you have been putting off and start it now." },
    { quote: "In any moment of decision, the best thing you can do is the right thing.", author: "Theodore Roosevelt", focus: "Make one clear call today — no sitting on the fence." },
    { quote: "It always seems impossible until it is done.", author: "Nelson Mandela", focus: "Move the task that feels too big. It is smaller in motion than in the mind." },
    { quote: "The quality of a person's life is in direct proportion to their commitment to excellence.", author: "Vince Lombardi", focus: "Raise the bar on one thing today — even slightly." },
    { quote: "You don't build a school, you build people, and then people build the school.", author: "Adapted from Haile Selassie", focus: "Invest in one person on your team today." },
    { quote: "Efficiency is doing things right; effectiveness is doing the right things.", author: "Peter Drucker", focus: "Ask yourself: am I busy, or am I moving things forward?" },
    { quote: "The greatest asset of a school is the spirit of its people.", author: "Unknown", focus: "Protect the morale around you today." },
    { quote: "Order is the shape upon which beauty depends.", author: "Pearl S. Buck", focus: "Bring clarity to one process that has been causing confusion." },
    { quote: "Success is the sum of small efforts repeated day in and day out.", author: "Robert Collier", focus: "Show up fully today. The consistency is the work." },
  ],
  super_admin: [
    { quote: "A leader is one who knows the way, goes the way, and shows the way.", author: "John C. Maxwell", focus: "Be visible today — your presence sets the tone." },
    { quote: "Management is doing things right; leadership is doing the right things.", author: "Peter Drucker", focus: "Question whether today's priorities are the right ones, not just the urgent ones." },
    { quote: "The function of leadership is to produce more leaders, not more followers.", author: "Ralph Nader", focus: "Delegate one decision today and trust someone else to carry it." },
    { quote: "He who has never learned to obey cannot be a good commander.", author: "Aristotle", focus: "Listen before directing — understand before deciding." },
    { quote: "The price of greatness is responsibility.", author: "Winston Churchill", focus: "Own something difficult today rather than routing it away." },
    { quote: "People buy into the leader before they buy into the vision.", author: "John C. Maxwell", focus: "Build trust with one person today through honesty and follow-through." },
    { quote: "If your actions inspire others to dream more, learn more, do more, and become more, you are a leader.", author: "John Quincy Adams", focus: "Ask yourself today: what did I inspire?" },
    { quote: "The strength of the team is each individual member. The strength of each member is the team.", author: "Phil Jackson", focus: "Lift one person who is struggling and the whole school benefits." },
    { quote: "Do not follow where the path may lead. Go instead where there is no path and leave a trail.", author: "Ralph Waldo Emerson", focus: "Make one decision today that improves things for years, not just today." },
    { quote: "The art of leadership is saying no, not yes. It is very easy to say yes.", author: "Tony Blair", focus: "Protect the school's focus — decline what does not belong on the list." },
  ],
  teacher: [
    { quote: "Education is not the filling of a pail, but the lighting of a fire.", author: "W.B. Yeats", focus: "Find one student today who needs the spark, not more information." },
    { quote: "A teacher affects eternity; he can never tell where his influence stops.", author: "Henry Adams", focus: "Teach as though what you say today will echo for a long time." },
    { quote: "Tell me and I forget. Teach me and I remember. Involve me and I learn.", author: "Benjamin Franklin", focus: "Get the students doing something today, not just watching." },
    { quote: "The art of teaching is the art of assisting discovery.", author: "Mark Van Doren", focus: "Ask more questions today — let the students find the answers." },
    { quote: "Children must be taught how to think, not what to think.", author: "Margaret Mead", focus: "Challenge one assumption in your lesson today." },
    { quote: "The mediocre teacher tells. The good teacher explains. The superior teacher demonstrates. The great teacher inspires.", author: "William Arthur Ward", focus: "Which level are you aiming for in today's lesson?" },
    { quote: "Teaching is the greatest act of optimism.", author: "Colleen Wilcox", focus: "You believe in their future more than they do right now. Show it." },
    { quote: "It is the supreme art of the teacher to awaken joy in creative expression and knowledge.", author: "Albert Einstein", focus: "Find something delightful in today's subject and share it." },
    { quote: "The best teachers are those who show you where to look but don't tell you what to see.", author: "Alexandra K. Trenfor", focus: "Step back in one moment today and let a student work it out themselves." },
    { quote: "Education is the passport to the future, for tomorrow belongs to those who prepare for it today.", author: "Malcolm X", focus: "Remind your students today that school is not an obstacle — it is the door." },
  ],
  student: [
    { quote: "Live as if you were to die tomorrow. Learn as if you were to live forever.", author: "Mahatma Gandhi", focus: "Treat today's lesson as something that will stay with you." },
    { quote: "Education is the most powerful weapon which you can use to change the world.", author: "Nelson Mandela", focus: "Understand that what you are learning now actually matters." },
    { quote: "The expert in anything was once a beginner.", author: "Helen Hayes", focus: "Do not be embarrassed by what you do not know yet — that is why you are here." },
    { quote: "The more that you read, the more things you will know.", author: "Dr. Seuss", focus: "Read something today beyond what is required." },
    { quote: "You don't have to be great to start, but you have to start to be great.", author: "Zig Ziglar", focus: "Start the assignment you have been avoiding. Just start." },
    { quote: "Success is no accident. It is hard work, perseverance, learning, studying, sacrifice, and most of all, love of what you are doing.", author: "Pelé", focus: "Put real effort into one thing today — not just enough to finish." },
    { quote: "The secret of success is to do the common things uncommonly well.", author: "John D. Rockefeller", focus: "Do today's ordinary schoolwork with full attention." },
    { quote: "Strive for progress, not perfection.", author: "Unknown", focus: "You do not need to get everything right. You need to keep improving." },
    { quote: "Believe you can and you are halfway there.", author: "Theodore Roosevelt", focus: "Walk into class today expecting to understand, not just to sit through it." },
    { quote: "The mind is not a vessel to be filled, but a fire to be kindled.", author: "Plutarch", focus: "Ask at least one question today. Curiosity is the point." },
  ],
};

function normalizeRole(role) {
  if (role === "super_admin") return "super_admin";
  if (role === "teacher") return "teacher";
  if (role === "student") return "student";
  return "admin";
}

function getDaySeed(date = new Date()) {
  const { year, month, day } = getLagosDateParts(date);
  return Number(`${year}${String(month).padStart(2, "0")}${String(day).padStart(2, "0")}`);
}

export function getDailyMotivation(role, date = new Date()) {
  const normalizedRole = normalizeRole(role);
  const quotes = QUOTES_BY_ROLE[normalizedRole] || QUOTES_BY_ROLE.admin;
  const seed = getDaySeed(date);
  const index = seed % quotes.length;
  return {
    role: normalizedRole,
    ...quotes[index],
  };
}
