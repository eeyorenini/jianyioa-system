'use strict';
/**
 * 客户身份识别（业主主账户 / 家庭成员）—— 登录链路唯一入口
 * ================================================================
 * 2026-10-29 v2.5.3 新建。此前「按手机号认身份」的逻辑在三个地方各写了一份：
 *   · server/api/login.js        POST /api/customers/login
 *   · server/api/wechat-mini.js  POST /api/customer-auth/login-by-code
 *   · server/api/wechat-mini.js  POST /api/wechat/mini-login（resolveCustomerByPhone）
 * 三份都用「先查 family_members 再查 customers」的顺序，带来三个后果：
 *
 * ① 身份被抢：有独立客户档案的人，只要手机号被别人登记成家庭成员，登录进去
 *    就成了别人家的成员，自己名下的项目和合同全部看不见。
 *    → 现在统一改为 **自己的客户档案优先**（主账号权利不被剥夺）。
 *
 * ② 静默入家：业主在页面上填一个手机号，对方一登录就自动变成这家人。
 *    → 现在引入「待绑定」：成员本人必须确认一次才写 bound_at。
 *
 * ③ id 撞号越权：副账户登录后如果 `customer.id` 用 family_members.id，
 *    而后端拿它去 customers 表查，两套自增序列会撞号。
 *    → 现在前端同时注入 `x-user-scope: member`，后端见到它就直接查
 *      family_members、跳过 customers，撞号问题从根上消失。
 *
 * 2026-10-29 二次改造（项目级授权）：
 *   一个手机号代表一个**人**，可能同时是：
 *     · 自己项目的主账号（有 customers 档案）
 *     · 别人某个项目的副账号（被邀请，一个或多个项目）
 *   这两个身份并存，可见项目取并集。所以返回结构从「单一身份」改为
 *   「身份 + pendingMembers/boundMembers 两组授权行」，登录时一次把
 *   所有待确认项目都带出去，前端一次确认全部绑定。
 *
 * 依赖注入：db（db-mysql-async 实例，prepare/get/all/run）。
 * pendingBinds 是模块级变量，多个 api 模块各自 createResolver() 也共享同一份。
 */

const crypto = require('crypto');

/** 待绑定凭证有效期：5 分钟，够用户看完弹窗再点确认 */
const BIND_TTL_MS = 5 * 60 * 1000;

/** bindToken → { memberIds:[], phone, openid, expiresAt } */
const pendingBinds = new Map();

/** 清掉过期凭证，防长时间运行的进程里 Map 无限增长 */
function purgeExpiredBinds() {
  const now = Date.now();
  for (const [token, rec] of pendingBinds) {
    if (!rec || rec.expiresAt <= now) pendingBinds.delete(token);
  }
}

/** 手机号打码：13716900747 → 137****0747 */
function maskPhone(phone) {
  const p = String(phone || '');
  if (p.length < 7) return p ? '****' : '';
  return p.slice(0, 3) + '****' + p.slice(-4);
}

function createResolver(deps) {
  // 只用到 db（db-mysql-async 的 prepare/get/all/run）；调用方多传 pool 也无妨
  const { db } = deps || {};

  /**
   * 按手机号解析身份（一个号码 = 一个人，可能有多重身份）。
   *
   * @returns
   *   { ok:false, message }                                     未登记
   *   { ok:true, kind:'master',  customer, pendingMembers }      有自己客户档案（主账号）
   *   { ok:true, kind:'member',  member, master, ... }           纯成员，且至少绑好了一个项目
   *   { ok:true, kind:'pending', member, master, pendingMembers }纯成员，一个都还没确认
   *
   * 三种 ok 情况下都会带 pendingMembers（待确认的授权行，含 project_name），
   * 前端据此决定是否弹「XX 邀请您查看 YY 项目」的确认框：
   *   · kind='pending' → 必须确认才能进（否则一个项目都看不到）
   *   · kind='master' / 'member' → 已有权限，弹窗可「稍后再说」
   */
  async function resolveCustomerByPhone(phone) {
    const p = String(phone || '').trim();
    if (!p) return { ok: false, message: '手机号不能为空' };

    // ① 自己的客户档案（主账号权利来源）
    const customer = await db
      .prepare('SELECT * FROM customers WHERE phone = ? LIMIT 1')
      .get(p);

    // ② 该号码被授权的全部记录（可能跨多个主账号、多个项目）
    const rows =
      (await db
        .prepare(
          `SELECT fm.*, pj.name AS project_name, pj.customer_id AS project_owner_id
             FROM family_members fm
             LEFT JOIN projects pj ON pj.id = fm.project_id
            WHERE fm.phone = ? AND fm.status = 1
            ORDER BY fm.id ASC`
        )
        .all(p)) || [];

    // 主账号自述行（is_master=1）不产生授权，只排除掉
    const memberRows = rows.filter((r) => Number(r.is_master) !== 1);
    const pendingRows = memberRows.filter((r) => !r.bound_at);
    const boundRows = memberRows.filter((r) => !!r.bound_at);

    // 补主账号姓名，前端弹窗要显示「郭大大 邀请您查看…」
    if (pendingRows.length) {
      const ownerIds = Array.from(new Set(pendingRows.map((r) => Number(r.customer_id)).filter(Boolean)));
      if (ownerIds.length) {
        const owners =
          (await db
            .prepare(
              `SELECT id, name, phone FROM customers WHERE id IN (${ownerIds.map(() => '?').join(',')})`
            )
            .all(...ownerIds)) || [];
        const byId = new Map(owners.map((o) => [Number(o.id), o]));
        for (const r of pendingRows) {
          const o = byId.get(Number(r.customer_id));
          r.master_name = (o && o.name) || '';
          r.master_phone = (o && o.phone) || '';
        }
      }
    }

    // ---- 主账号：有自己客户档案 ----
    if (customer) {
      return {
        ok: true,
        kind: 'master',
        customer,
        members: memberRows,
        pendingMembers: pendingRows,
        boundMembers: boundRows,
      };
    }

    // ---- 纯成员：没有自己档案，靠被邀请获得权限 ----
    if (!memberRows.length) return { ok: false, message: '未查询到您名下的装修项目，请联系为您服务的销售人员或设计师为您添加' };

    const anchor = await db
      .prepare('SELECT * FROM customers WHERE id = ? LIMIT 1')
      .get(memberRows[0].customer_id);
    if (!anchor) {
      // customer_id 指向的客户档案已被删除（历史脏数据），不能放行
      return { ok: false, message: '该手机号关联的项目已失效，请联系您的项目经理' };
    }

    const base = {
      ok: true,
      master: anchor,
      masterCustomer: anchor,
      masterCustomerId: anchor.id,
      isFamilyMember: true,
      members: memberRows,
      pendingMembers: pendingRows,
      boundMembers: boundRows,
    };

    if (!boundRows.length) {
      const first = pendingRows[0] || memberRows[0];
      return Object.assign({}, base, {
        kind: 'pending',
        member: first,
        familyMemberId: first.id,
        relation: first.relation || '',
        customer: { id: first.id, name: first.name || '', phone: first.phone || '', is_master: 0 },
      });
    }

    const first = boundRows[0];
    return Object.assign({}, base, {
      kind: 'member',
      member: first,
      familyMemberId: first.id,
      relation: first.relation || '',
      customer: { id: first.id, name: first.name || '', phone: first.phone || '', is_master: 0 },
    });
  }

  /**
   * 签发一次性绑定凭证。
   * 一次把**所有**待确认的授权行塞进去 —— 用户点一次确认就全部加入，
   * 不用为每个项目各弹一次。
   */
  function issueBindToken(ident, openid) {
    const pending = ((ident && ident.pendingMembers) || []).filter((r) => r && r.id);
    if (!pending.length) return null;
    purgeExpiredBinds();
    const token = crypto.randomBytes(24).toString('hex');
    pendingBinds.set(token, {
      memberIds: pending.map((r) => Number(r.id)),
      phone: String(pending[0].phone || (ident.member && ident.member.phone) || ''),
      openid: openid ? String(openid) : null,
      expiresAt: Date.now() + BIND_TTL_MS,
    });
    return token;
  }

  /**
   * 取出并作废绑定凭证。
   * 一次性：确认接口调过之后同一个 token 再用就失效，防重复绑定。
   */
  function consumeBindToken(token) {
    purgeExpiredBinds();
    const key = String(token || '');
    const rec = pendingBinds.get(key);
    if (!rec) return null;
    pendingBinds.delete(key);
    if (rec.expiresAt <= Date.now()) return null;
    return rec;
  }

  /** 把授权行整理成前端弹窗要的列表（不含手机号全量，只给项目名和邀请人） */
  function mapPendingProjects(pending) {
    return (pending || []).map((r) => ({
      memberId: Number(r.id),
      projectId: r.project_id ? Number(r.project_id) : null,
      projectName: r.project_name || '',
      masterName: r.master_name || '',
      relation: r.relation || '',
    }));
  }

  /**
   * 待绑定成员登录时的响应体。
   * 不返回项目进度 / 合同等业务数据 —— 用户还没点确认，不能先看到这家人。
   * 只告诉 TA「谁邀请你看哪个项目」。
   */
  function buildPendingPayload(ident, bindToken) {
    const pending = ident.pendingMembers || [];
    const first = pending[0] || {};
    return {
      success: true,
      needBindFamily: true,
      bindToken,
      bindExpiresIn: Math.floor(BIND_TTL_MS / 1000),
      // ★ 全部待确认项目，前端一次列出、一次确认
      pendingProjects: mapPendingProjects(pending),
      family: {
        masterName: first.master_name || '',
        masterPhoneMasked: maskPhone(first.master_phone),
        relation: first.relation || '',
      },
      member: {
        id: first.id || null,
        name: first.name || '',
        phone: first.phone || '',
      },
      message: pending.length > 1
        ? `有 ${pending.length} 个项目邀请您查看，请确认`
        : '请确认是否查看该项目',
    };
  }

  /**
   * 构造登录成功响应体。
   * 结构沿用 /api/customers/login 的历史字段（customer / masterCustomer /
   * masterCustomerId / isFamilyMember），移动端 saveCustomerIdentity() 直接复用。
   *
   * ⚠️ 副账户的 customer.id 是 **family_members.id（成员自己）**，
   *    前端必须同时注入 `x-user-scope: member`，后端才会跳过 customers 表去查成员行。
   *    不能再用主账号 id —— 那会让后端按手机号反查到主账号，权限放大成整个家族。
   */
  function buildLoginPayload(ident, extra) {
    const tail = extra || {};
    const pendingProjects = mapPendingProjects(ident && ident.pendingMembers);

    if (!ident || ident.kind === 'master') {
      return Object.assign(
        {
          success: true,
          customer: ident ? ident.customer : null,
          // 主账号也可能被别人的项目邀请 → 一并带出，登录后弹「稍后再说」的提醒
          pendingProjects,
        },
        tail
      );
    }

    const m = ident.member || {};
    const master = ident.master || {};
    return Object.assign(
      {
        success: true,
        customer: {
          id: m.id,               // ★ 成员自己的 family_members.id（配 x-user-scope: member）
          name: m.name || '',     // 显示成员自己的名字
          phone: m.phone || '',
          relation: m.relation || '',
          is_master: 0,
        },
        masterCustomer: master,
        masterCustomerId: master.id,
        isFamilyMember: true,
        familyMemberId: m.id,     // ★ 成员自己的 id
        relation: m.relation || '',
        pendingProjects,
        // 已授权的项目（用于「我的项目」直接渲染，不必再请求一次）
        grantedProjects: (ident.boundMembers || [])
          .filter((r) => r.project_id)
          .map((r) => ({ id: Number(r.project_id), name: r.project_name || '' })),
      },
      tail
    );
  }

  return {
    resolveCustomerByPhone,
    issueBindToken,
    consumeBindToken,
    buildPendingPayload,
    buildLoginPayload,
    mapPendingProjects,
    maskPhone,
    // 测试钩子：仅供本地验证脚本观察队列长度，业务代码不要用
    _pendingSize: () => pendingBinds.size,
  };
}

module.exports = { createResolver, maskPhone, BIND_TTL_MS };
