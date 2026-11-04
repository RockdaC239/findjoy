import type { BirthProfile } from "./profile";

export interface FamilyAgeFact {
  role: string;
  relation: string;
  ageAtBirth: number;
  currentAge: number;
  status?: string;
}

export interface FamilyAges {
  protagonistAge: number;
  members: FamilyAgeFact[];
}

/**
 * 人物年龄由程序统一维护：以“出生时年龄 + 主角当前年龄”计算。
 * 模型只拿当前年龄写故事，不负责加减，也不在故事里给亲属写具体岁数。
 */
export function familyAges(profile: BirthProfile | undefined, protagonistAge: number): FamilyAges | undefined {
  if (!profile) return undefined;
  const current = Number.isFinite(protagonistAge) ? Math.max(0, Math.floor(protagonistAge)) : 0;
  const members: FamilyAgeFact[] = [
    ...profile.parents.map(parent => ({
      role: parent.role,
      relation: parent.role,
      ageAtBirth: parent.birthAge,
      currentAge: parent.birthAge + current,
      status: parent.status,
    })),
    ...profile.household.siblings.map((ageAtBirth, index) => ({
      role: "兄姐",
      relation: `兄姐（第${index + 1}位，性别未指定）`,
      ageAtBirth,
      currentAge: ageAtBirth + current,
    })),
  ];
  return { protagonistAge: current, members };
}
