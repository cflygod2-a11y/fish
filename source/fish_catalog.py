"""Fish pool and proposed seasonal availability. Lengths are integer millimetres."""

RARITIES = ("常见", "少见", "稀有", "传说", "神秘")
SEASON_KEYS = ("spring", "summer", "autumn", "winter")
FISH_CATALOG = (
    {'name': '沙丁鱼', 'rarity': '常见', 'min_mm': 100, 'max_mm': 300, 'seasons': ('spring', 'summer', 'autumn', 'winter')},
    {'name': '竹荚鱼', 'rarity': '常见', 'min_mm': 140, 'max_mm': 440, 'seasons': ('spring', 'summer', 'autumn', 'winter')},
    {'name': '银鲳', 'rarity': '常见', 'min_mm': 150, 'max_mm': 500, 'seasons': ('spring', 'summer', 'autumn', 'winter')},
    {'name': '花鲈', 'rarity': '少见', 'min_mm': 260, 'max_mm': 920, 'seasons': ('spring', 'summer', 'autumn', 'winter')},
    {'name': '真鲷', 'rarity': '少见', 'min_mm': 220, 'max_mm': 960, 'seasons': ('spring', 'summer', 'autumn', 'winter')},
    {'name': '蓝点马鲛', 'rarity': '少见', 'min_mm': 280, 'max_mm': 1120, 'seasons': ('spring', 'summer', 'autumn', 'winter')},
    {'name': '红石斑', 'rarity': '稀有', 'min_mm': 320, 'max_mm': 1220, 'seasons': ('spring', 'summer', 'autumn', 'winter')},
    {'name': '黄鳍金枪鱼', 'rarity': '稀有', 'min_mm': 460, 'max_mm': 1750, 'seasons': ('spring', 'summer', 'autumn', 'winter')},
    {'name': '珍珠鳐', 'rarity': '稀有', 'min_mm': 420, 'max_mm': 1460, 'seasons': ('spring', 'summer', 'autumn', 'winter')},
    {'name': '星纹旗鱼', 'rarity': '传说', 'min_mm': 900, 'max_mm': 3200, 'seasons': ('spring', 'summer', 'autumn', 'winter')},
    {'name': '金鳞皇带鱼', 'rarity': '传说', 'min_mm': 1200, 'max_mm': 3800, 'seasons': ('spring', 'summer', 'autumn', 'winter')},
    {'name': '桃鳍鳑鲏', 'rarity': '少见', 'min_mm': 80, 'max_mm': 220, 'seasons': ('spring',)},
    {'name': '柳叶鳗', 'rarity': '少见', 'min_mm': 350, 'max_mm': 1200, 'seasons': ('spring', 'summer')},
    {'name': '春溪蝶尾', 'rarity': '稀有', 'min_mm': 120, 'max_mm': 380, 'seasons': ('spring',)},
    {'name': '花枝鹿鲤', 'rarity': '神秘', 'min_mm': 900, 'max_mm': 2200, 'seasons': ('spring',)},
    {'name': '蓝翼飞鱼', 'rarity': '稀有', 'min_mm': 200, 'max_mm': 550, 'seasons': ('summer',)},
    {'name': '绿纹河豚', 'rarity': '少见', 'min_mm': 120, 'max_mm': 380, 'seasons': ('summer',)},
    {'name': '珊瑚狮子鱼', 'rarity': '稀有', 'min_mm': 180, 'max_mm': 450, 'seasons': ('summer', 'autumn')},
    {'name': '曜日翻车鱼', 'rarity': '神秘', 'min_mm': 1600, 'max_mm': 4200, 'seasons': ('summer',)},
    {'name': '铜铃箱鲀', 'rarity': '少见', 'min_mm': 120, 'max_mm': 400, 'seasons': ('autumn',)},
    {'name': '枫叶蝠鲼', 'rarity': '稀有', 'min_mm': 700, 'max_mm': 2400, 'seasons': ('autumn',)},
    {'name': '胭脂鲑', 'rarity': '少见', 'min_mm': 450, 'max_mm': 1150, 'seasons': ('autumn', 'winter')},
    {'name': '烛灯鮟鱇', 'rarity': '神秘', 'min_mm': 550, 'max_mm': 1800, 'seasons': ('autumn',)},
    {'name': '霜斑鳕鱼', 'rarity': '少见', 'min_mm': 450, 'max_mm': 1400, 'seasons': ('winter',)},
    {'name': '银甲鲟', 'rarity': '传说', 'min_mm': 900, 'max_mm': 3600, 'seasons': ('winter',)},
    {'name': '雪点比目鱼', 'rarity': '稀有', 'min_mm': 200, 'max_mm': 650, 'seasons': ('winter', 'spring')},
    {'name': '极光龙鳗', 'rarity': '神秘', 'min_mm': 1800, 'max_mm': 6000, 'seasons': ('winter',)},
)

FISH_BY_NAME = {fish["name"]: fish for fish in FISH_CATALOG}
SPECIES = tuple(tuple((f["name"], f["min_mm"], f["max_mm"])
                      for f in FISH_CATALOG if f["rarity"] == rarity)
                for rarity in RARITIES)
SPECIES_BY_SEASON = {
    season: tuple(tuple((f["name"], f["min_mm"], f["max_mm"])
                        for f in FISH_CATALOG
                        if f["rarity"] == rarity and season in f["seasons"])
                  for rarity in RARITIES)
    for season in SEASON_KEYS
}


def is_tiny(name, mm):
    fish = FISH_BY_NAME[name]
    return (mm - fish["min_mm"]) * 100 <= (fish["max_mm"] - fish["min_mm"]) * 15


def public_catalog():
    return [{"name": f["name"], "rarity": f["rarity"],
             "min_cm": f["min_mm"] / 10, "max_cm": f["max_mm"] / 10,
             "seasons": list(f["seasons"])} for f in FISH_CATALOG]
