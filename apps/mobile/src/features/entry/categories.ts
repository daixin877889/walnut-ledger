export type EntryCategory = { name: string; icon: string; tone: string }
export const expenseCategories: EntryCategory[] = [
  { name: '餐饮', icon: '🍜', tone: 'orange' }, { name: '购物', icon: '🛍️', tone: 'pink' }, { name: '交通', icon: '🚕', tone: 'blue' }, { name: '居住', icon: '🏠', tone: 'green' }, { name: '娱乐', icon: '🎮', tone: 'purple' },
  { name: '医疗', icon: '💊', tone: 'red' }, { name: '学习', icon: '📚', tone: 'blue' }, { name: '旅行', icon: '✈️', tone: 'cyan' }, { name: '人情', icon: '🎁', tone: 'pink' }, { name: '宠物', icon: '🐾', tone: 'gold' },
  { name: '通讯', icon: '📱', tone: 'purple' }, { name: '水电', icon: '💡', tone: 'gold' }, { name: '服饰', icon: '👕', tone: 'cyan' }, { name: '买菜', icon: '🥦', tone: 'green' }, { name: '水果', icon: '🍎', tone: 'red' },
  { name: '美容', icon: '💄', tone: 'pink' }, { name: '运动', icon: '⚽', tone: 'blue' }, { name: '报销', icon: '🧾', tone: 'gold' }, { name: '汽车', icon: '🚙', tone: 'cyan' }, { name: '其他', icon: '📦', tone: 'gray' },
]
export const incomeCategories: EntryCategory[] = [
  { name: '工资', icon: '💼', tone: 'green' }, { name: '奖金', icon: '🏆', tone: 'gold' }, { name: '理财', icon: '📈', tone: 'blue' }, { name: '兼职', icon: '🧑‍💻', tone: 'purple' }, { name: '红包', icon: '🧧', tone: 'red' }, { name: '退款', icon: '↩️', tone: 'cyan' }, { name: '其他', icon: '✨', tone: 'gray' },
]
