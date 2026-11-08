"""Synthetic examples. This module never reads any input files."""

from datetime import date, timedelta


# The app shifts this fictional calendar relative to the day the demo is opened.
REFERENCE_DAY = date(2030, 1, 15)
PATHS = (
    ("泡简历", ("泡简历",)),
    ("测评", ("泡简历", "测评")),
    ("笔试", ("泡简历", "测评", "笔试")),
    ("AI面", ("泡简历", "笔试", "AI面")),
    ("一面", ("泡简历", "测评", "一面")),
    ("二面", ("泡简历", "笔试", "一面", "二面")),
    ("三面", ("泡简历", "一面", "二面", "三面")),
    ("HR面", ("泡简历", "一面", "二面", "HR面")),
    ("Offer", ("泡简历", "笔试", "一面", "二面", "HR面", "Offer")),
    ("简历挂", ("泡简历",)),
)
SIZES = ("大厂", "中大厂", "中厂", "小厂", "独角兽", "创投")
ROLES = ("应用开发", "数据分析", "前端开发", "测试开发", "产品设计")
OUTCOMES = ("pending", "pending", "pass", "fail", "abandoned")


def demo_records():
    records = []
    for group, (label, stages) in enumerate(PATHS):
        for sample in range(5):
            number = group * 5 + sample + 1
            record_id = f"demo-{number:02d}"
            # One upcoming and one completed-but-undecided example per active stage.
            offset = 1 + group % 4 if sample == 0 else -sample - group % 3
            if label in {"Offer", "简历挂", "泡简历"}:
                offset = -sample - 1
            last_day = REFERENCE_DAY + timedelta(days=offset)
            applied = last_day - timedelta(days=4 * len(stages) + 2)
            entries = []
            for index, stage in enumerate(stages):
                last = index == len(stages) - 1
                if not last:
                    result = "pass"
                elif label == "简历挂":
                    result = "fail"
                elif label in {"Offer", "泡简历"}:
                    result = "pending"
                else:
                    result = OUTCOMES[sample]
                handled = "已处理" if result != "pending" or label == "Offer" or last and sample == 1 and label != "泡简历" else "未处理"
                stage_day = last_day - timedelta(days=4 * (len(stages) - 1 - index))
                when = "" if stage == "泡简历" else f"{stage_day.isoformat()}T{9 + sample * 2:02d}:30"
                entry = {
                    "id": f"{record_id}-stage-{index + 1}",
                    "stage": stage,
                    "result": result,
                    "when": when,
                    "note": "演示：等待后续通知" if last and result == "pending" and handled == "已处理" and label != "Offer" else "",
                    "handled": handled,
                    "performance": "演示：记录本轮问题与复盘要点" if stage in {"一面", "二面", "三面", "HR面"} and result in {"pass", "fail"} else "",
                    "enteredAt": "",
                    "source": "阶段流转" if index else "示例数据",
                    "resultManual": True,
                }
                if index:
                    entry.update(previousEntryId=entries[-1]["id"], transitionKind="advance")
                entries.append(entry)
            records.append({
                "id": record_id,
                "base": {
                    "company": f"示例公司 {number:02d}",
                    "applied": applied.isoformat(),
                    "role": f"示例岗位 · {ROLES[(group + sample) % len(ROLES)]}",
                    "size": SIZES[(number - 1) % len(SIZES)],
                    "website": "",
                    "location": f"示例城市 {chr(65 + (number - 1) % 5)}",
                    "department": f"示例团队 {chr(65 + group % 4)}",
                    "preference": "理想" if number % 2 else "非理想",
                },
                "entries": entries,
                "current": entries[-1]["id"],
                "currentManual": True,
            })
    return records
