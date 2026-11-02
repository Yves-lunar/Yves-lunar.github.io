// Public browser configuration. Never use sb_secret_ keys, service_role or a database password.
window.LITTLE_DAYS_SUPABASE = Object.freeze({
  url: "https://wgabwfewcexgcicdqmjd.supabase.co",
  table: "little_days_items",
  publishableKey: "sb_publishable_PnxpTzNsVQr9onrCppPgNg_CMoBohJ0"
});

// 打卡抽签设置：改这里即可，保存后刷新页面生效，已抽到的记录不受影响。
window.LITTLE_DAYS_CHECKIN = Object.freeze({
  label: "今天做了吗",            // 打卡问题
  prizes: [                        // 每档额度（元）和概率（%），概率加起来应为 100
    { amount: 10,  chance: 40 },
    { amount: 20,  chance: 28 },
    { amount: 30,  chance: 14 },
    { amount: 50,  chance: 10 },
    { amount: 80,  chance: 5 },
    { amount: 100, chance: 3 }
  ],
  luckyChance: 40,                 // 幸运暴击概率（%），与额度分开独立判定
  luckyMultiplier: 2,              // 暴击倍数
  platforms: ["网易", "苹果"],     // 「本周已充」可选的平台
  unit: "元",
  dayStartsAt: 4                   // 凌晨几点换日：4 表示 0–4 点打卡仍算前一天（0 = 零点换日）
});
