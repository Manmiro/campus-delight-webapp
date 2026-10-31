/** Pay Later repayment reminders: sent daily at 12 noon (Lagos) from 3 days before the due date until the due date. */
export const REMINDER_WINDOW_DAYS = 3;

export function shouldRemind(daysLeft: number, balanceKobo: number): boolean {
  return Number.isInteger(daysLeft) && daysLeft >= 0 && daysLeft <= REMINDER_WINDOW_DAYS && balanceKobo > 0;
}

export function dueLabel(daysLeft: number): string {
  if (daysLeft <= 0) return "today";
  if (daysLeft === 1) return "tomorrow";
  return `in ${daysLeft} days`;
}

/** Kind, encouraging copy that grows gently warmer as the due date approaches. */
export function reminderCopy(daysLeft: number) {
  if (daysLeft <= 0) {
    return {
      title: "Today's the day — you've got this! 💪",
      line: "Your Pay Later repayment is due today. A quick repayment now keeps your record spotless and keeps your plate full whenever hunger strikes.",
      perk: "Repay in full and on time to double your Pay Later limit next time. 🚀",
    };
  }
  if (daysLeft === 1) {
    return {
      title: "Just one more day 🌟",
      line: "Your Pay Later repayment is due tomorrow. Settling it today means one less thing on your mind — and more good meals ahead.",
      perk: "On-time, full repayment doubles your limit for your next craving. 🍛",
    };
  }
  return {
    title: `A friendly nudge — ${daysLeft} days to go 😊`,
    line: `We loved feeding you! Your Pay Later repayment is due in ${daysLeft} days. Repaying early is the easiest way to stay ahead and enjoy stress-free meals.`,
    perk: "Repay in full before the due date and your limit doubles. 🎉",
  };
}
