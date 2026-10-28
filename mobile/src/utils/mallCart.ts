/**
 * 商城购物车（v2.5.1）
 *
 * 放前端 storage，不入库 —— 按"简单一些"的要求，业主换设备重新加即可，
 * 不为此多建一张表、多一组接口。
 *
 * 单价在这里只是「展示用快照」，下单时后端会用当前商城价重算，
 * 所以这里被改脏了也不会影响订单金额。
 */

export interface MallCartItem {
  id: number
  name: string
  spec: string
  brand: string
  image: string
  unit: string
  price: number
  qty: number
  stock: number
}

const KEY = 'mallCart'

export function readCart(): MallCartItem[] {
  try {
    const v = uni.getStorageSync(KEY)
    if (!v) return []
    const arr = typeof v === 'string' ? JSON.parse(v) : v
    if (!Array.isArray(arr)) return []
    return arr
      .filter((i: any) => i && Number(i.id))
      .map((i: any) => ({
        id: Number(i.id),
        name: String(i.name || ''),
        spec: String(i.spec || ''),
        brand: String(i.brand || ''),
        image: String(i.image || ''),
        unit: String(i.unit || ''),
        price: Number(i.price) || 0,
        qty: Math.max(1, Number(i.qty) || 1),
        stock: Number(i.stock) || 0
      }))
  } catch (e) {
    return []
  }
}

export function writeCart(items: MallCartItem[]) {
  try {
    uni.setStorageSync(KEY, JSON.stringify(items || []))
  } catch (e) {
    /* 存不进去不影响本次操作 */
  }
}

export function cartCount(items?: MallCartItem[]): number {
  const list = items || readCart()
  return list.reduce((a, i) => a + (Number(i.qty) || 0), 0)
}

export function cartAmount(items?: MallCartItem[]): number {
  const list = items || readCart()
  const s = list.reduce((a, i) => a + (Number(i.price) || 0) * (Number(i.qty) || 0), 0)
  return Math.round(s * 100) / 100
}

/** 加购：已有就累加；超出库存（stock>0 才算）按库存封顶 */
export function addToCart(goods: any, qty = 1): { ok: boolean; msg: string; count: number } {
  const list = readCart()
  const id = Number(goods && goods.id)
  if (!id) return { ok: false, msg: '商品无效', count: cartCount(list) }

  const stock = Number(goods.mall_stock) || 0
  const add = Math.max(1, Number(qty) || 1)
  const hit = list.find((i) => i.id === id)

  if (hit) {
    const next = hit.qty + add
    if (stock > 0 && next > stock) {
      return { ok: false, msg: `库存仅剩 ${stock}${hit.unit || ''}`, count: cartCount(list) }
    }
    hit.qty = next
  } else {
    if (stock > 0 && add > stock) {
      return { ok: false, msg: `库存仅剩 ${stock}${goods.quote_unit || ''}`, count: cartCount(list) }
    }
    list.push({
      id,
      name: String(goods.name || ''),
      spec: String(goods.specification || goods.model || ''),
      brand: String(goods.brand_name || ''),
      image: String(goods.cover_image || ''),
      unit: String(goods.quote_unit || ''),
      price: Number(goods.price) || 0,
      qty: add,
      stock
    })
  }
  writeCart(list)
  return { ok: true, msg: '已加入购物车', count: cartCount(list) }
}

export function updateQty(id: number, qty: number) {
  const list = readCart()
  const hit = list.find((i) => i.id === Number(id))
  if (!hit) return
  const n = Number(qty) || 0
  if (n <= 0) {
    writeCart(list.filter((i) => i.id !== Number(id)))
    return
  }
  hit.qty = hit.stock > 0 ? Math.min(n, hit.stock) : n
  writeCart(list)
}

export function removeItem(id: number) {
  writeCart(readCart().filter((i) => i.id !== Number(id)))
}

export function clearCart() {
  writeCart([])
}
