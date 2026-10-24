import type { Action } from "./commands";
import type { Data } from "../domain";
export function affectedSections(action: Action): string[] {
  const shared = ["audit"];
  switch (action.type) {
    case "member":
      return [...shared, "members", "memberships", "payments"];
    case "memberDelete":
      return [
        ...shared,
        "members",
        "memberships",
        "payments",
        "attendance",
        "reminders",
        "whatsapp",
      ];
    case "membership":
      return [...shared, "memberships", "payments"];
    case "membershipEdit":
    case "membershipExpire":
    case "freeze":
    case "resume":
    case "cancel":
    case "dueDate":
      return [...shared, "memberships"];
    case "payment":
    case "void":
      return [...shared, "payments"];
    case "attendance":
    case "checkout":
    case "attendanceRemove":
      return [...shared, "attendance"];
    case "reminder":
      return [...shared, "reminders"];
    case "plan":
    case "planDelete":
      return [...shared, "plans"];
    case "settings":
      return [...shared, "gym"];
    case "staffAdd":
    case "staffUpdate":
    case "staffRemove":
      return [...shared, "staff"];
    case "whatsappConfig":
    case "whatsappTemplate":
    case "whatsappTemplateDelete":
    case "reminderRule":
    case "reminderRuleDelete":
    case "whatsappSeed":
      return [...shared, "whatsapp"];
    case "export":
      return shared;
  }
}
export function supportsScopedReads(data?: Data): boolean {
  return data?.capabilities?.sections === true;
}
