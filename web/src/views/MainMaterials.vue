<template>
  <div class="mm-page">
    <!-- ============ 左：品类树 ============ -->
    <aside class="mm-side">
      <div class="side-head">
        <div class="side-title"><span class="dot"></span>商品档案</div>
        <div class="side-sub">主材 · 辅材 · 家具家电</div>
        <div class="side-tools">
          <button class="mini-btn" :class="{ on: view === 'wall' }" @click="toggleWall">
            <el-icon><Grid /></el-icon>品牌墙
          </button>
          <button class="mini-btn" @click="openCatMgr">
            <el-icon><Setting /></el-icon>品类管理
          </button>
        </div>
      </div>

      <div class="tree">
        <div class="node lv0" :class="{ active: !f.type_id && !f.category_id && !f.sub_id }" @click="pickNode({})">
          <span class="ico i0">全</span>全部商品<span class="cnt">{{ totalAll }}</span>
        </div>

        <template v-for="t in tree" :key="t.id">
          <div class="node lv0" :class="{ active: f.type_id === t.id && !f.category_id }" @click="pickNode({ type_id: t.id })">
            <span class="caret" :class="{ open: expanded.has('t' + t.id) }" @click.stop="toggleExpand('t' + t.id)">▶</span>
            <span class="ico" :class="typeIcon(t.code)">{{ t.name.charAt(0) }}</span>
            {{ t.name }}<span class="cnt">{{ t.count }}</span>
          </div>

          <template v-if="expanded.has('t' + t.id)">
            <template v-for="c in t.children" :key="c.id">
              <div class="node lv1" :class="{ active: f.category_id === c.id && !f.sub_id }" @click="pickNode({ type_id: t.id, category_id: c.id })">
                <span class="caret" :class="{ open: expanded.has('c' + c.id) }" @click.stop="toggleExpand('c' + c.id)">▶</span>
                {{ c.name }}<span class="cnt">{{ c.count }}</span>
              </div>
              <template v-if="expanded.has('c' + c.id)">
                <div
                  v-for="s in c.children" :key="s.id"
                  class="node lv2" :class="{ active: f.sub_id === s.id }"
                  @click="pickNode({ type_id: t.id, category_id: c.id, sub_id: s.id })"
                >
                  {{ s.name }}<span class="cnt">{{ s.count }}</span>
                </div>
              </template>
            </template>
          </template>
        </template>
      </div>

      <div class="side-foot">
        品类三级：类型 → 品类 → 子类<br>
        品牌独立成维度，可跨品类复用
      </div>
    </aside>

    <!-- ============ 右：主区 ============ -->
    <section class="mm-main">
      <header class="mm-top">
        <div class="crumb">材料管理 / <b>商品档案</b></div>
        <div class="top-stats">
          <div class="ts">在售商品<b>{{ totalAll }}</b></div>
          <div class="ts warn">缺主图<b>{{ facets.quick.noimg || 0 }}</b></div>
          <div class="ts warn">未定品类<b>{{ facets.quick.nocat || 0 }}</b></div>
          <div class="ts">已上架商城<b>{{ facets.quick.mall || 0 }}</b></div>
        </div>
        <div class="top-actions">
          <el-upload
            :show-file-list="false" action="/api/main-materials/import" name="file"
            :headers="uploadHeaders"
            accept=".xlsx" :on-success="onImportOk" :on-error="onImportErr"
          >
            <el-button>Excel 导入</el-button>
          </el-upload>
          <el-button @click="doExport">导出</el-button>
          <el-button type="primary" @click="openCreate">+ 新增商品</el-button>
        </div>
      </header>

      <div class="mm-toolbar">
        <div class="tb-row">
          <el-input
            v-model="f.keyword" class="search" placeholder="名称 / 编号 / 品牌 / 型号 / 拼音（如 cz）"
            clearable @input="onSearchInput"
          >
            <template #prefix><el-icon><Search /></el-icon></template>
          </el-input>

          <el-select
            v-model="f.brandIds" multiple collapse-tags collapse-tags-tooltip clearable
            placeholder="全部品牌" class="w-brand" @change="reload"
          >
            <el-option v-for="b in brands" :key="b.id" :label="b.name" :value="b.id">
              <span class="brand-opt">
                <span class="logo" :style="{ background: logoColor(b.name) }">{{ logoChar(b.name) }}</span>
                <span class="bn">{{ b.name }}</span>
                <span class="bc">{{ b.count }}</span>
              </span>
            </el-option>
          </el-select>

          <el-select v-model="f.series" clearable filterable placeholder="全部系列" class="w-series" @change="reload">
            <el-option v-for="s in seriesOptions" :key="s.name" :label="`${s.name} (${s.count})`" :value="s.name" />
          </el-select>

          <el-select v-model="f.sort" class="w-sort" @change="reload">
            <el-option label="默认排序" value="default" />
            <el-option label="报价 高 → 低" value="quote_desc" />
            <el-option label="报价 低 → 高" value="quote_asc" />
            <el-option label="毛利率 低 → 高" value="profit_asc" />
            <el-option label="毛利率 高 → 低" value="profit_desc" />
            <el-option label="按编号" value="id_asc" />
          </el-select>

          <div class="viewswitch">
            <button :class="{ on: view === 'card' }" @click="setView('card')">▦ 卡片</button>
            <button :class="{ on: view === 'table' }" @click="setView('table')">☰ 表格</button>
          </div>
        </div>

        <div class="quickbar">
          <span class="lab">快捷</span>
          <button v-for="q in QUICKS" :key="q.k" class="qchip" :class="{ on: f.quick === q.k }" @click="setQuick(q.k)">
            {{ q.label }} <span class="n">{{ facets.quick[q.k || 'all'] || 0 }}</span>
          </button>
        </div>

        <div v-if="activeChips.length" class="chipbar">
          <span class="lab">已选</span>
          <span v-for="c in activeChips" :key="c.k" class="chip">
            {{ c.t }}<span class="x" @click="removeChip(c)">✕</span>
          </span>
          <span class="clr" @click="clearAll">清空</span>
        </div>
      </div>

      <div class="mm-content" v-loading="loading">
        <!-- 卡片视图 -->
        <div v-if="view === 'card'" class="grid">
          <article v-for="m in list" :key="m.id" class="card" @click="openEdit(m)">
            <div class="thumb">
              <el-image v-if="m.cover_image" :src="assetUrl(m.cover_image)" fit="cover" class="ph-img" lazy />
              <div v-else class="ph-none"><el-icon><Picture /></el-icon><span>无主图</span></div>
              <span class="tag" :class="typeCls(m.type_name)">{{ m.type_name || '未分类' }}</span>
              <!-- 只有真上架才显示角标：全库 1138 条都「未上架」时逐卡标注纯属噪音 -->
              <span v-if="m.mall_status === 1" class="mall">商城在售</span>
              <span
                v-if="m.brand_display" class="thumb-logo"
                :style="{ background: logoColor(m.brand_display) }"
              >{{ logoChar(m.brand_display) }}</span>
            </div>
            <div class="card-body">
              <div class="c-name" :title="m.name">{{ m.name }}</div>
              <div class="c-meta">{{ m.specification || m.model || '无规格' }} · {{ m.brand_display || '品牌未定' }}</div>
              <div class="c-path">
                <template v-if="m.category_name">
                  <span class="b">{{ m.category_name }}</span>
                  <span class="s">{{ [m.sub_name, m.series].filter(Boolean).join(' · ') || '未分子类' }}</span>
                </template>
                <span v-else class="badge-r">未定品类</span>
              </div>
              <div class="c-price-row">
                <span class="c-price"><i>¥</i>{{ fmtNum(m.quote_price) }}<span class="u">/{{ m.quote_unit || '件' }}</span></span>
                <span class="profit" :class="{ low: profitOf(m) < 25 }">毛利 {{ profitOf(m) }}%</span>
              </div>
              <div class="c-foot">
                <span class="sp">{{ m.supplier_name || '未设供应商' }}</span>
                <span class="code">#{{ m.id }}</span>
              </div>
            </div>
          </article>
          <div v-if="!list.length && !loading" class="empty">
            <el-icon class="big"><Search /></el-icon>
            <div>没有找到匹配的商品</div>
            <div class="sug">试试：<a @click="clearAll">清空全部条件</a> · <a @click="quickSearch('cz')">搜「cz」</a> · <a @click="quickSearch('马可波罗')">搜「马可波罗」</a></div>
          </div>
        </div>

        <!-- 表格视图 -->
        <div v-else-if="view === 'table'" class="tablewrap">
          <el-table :data="list" border stripe style="width: 100%" empty-text="没有匹配的商品">
            <el-table-column label="商品" min-width="210">
              <template #default="{ row }">
                <div class="tcell">
                  <div class="timg">
                    <el-image v-if="row.cover_image" :src="assetUrl(row.cover_image)" fit="cover" style="width:100%;height:100%" />
                    <div v-else class="timg-none"><el-icon><Picture /></el-icon></div>
                  </div>
                  <div>
                    <div class="tname">{{ row.name }}</div>
                    <div class="tsub">{{ row.specification || row.model || '—' }} · #{{ row.id }}</div>
                  </div>
                </div>
              </template>
            </el-table-column>
            <el-table-column label="品类" width="132">
              <template #default="{ row }">
                <template v-if="row.category_name">
                  <span class="badge">{{ row.category_name }}</span>
                  <span class="sub">{{ row.sub_name || '' }}</span>
                </template>
                <span v-else class="badge-r">未定</span>
              </template>
            </el-table-column>
            <el-table-column label="品牌" width="112">
              <template #default="{ row }">
                <span v-if="row.brand_display" class="bcell">
                  <span class="logo" :style="{ background: logoColor(row.brand_display) }">{{ logoChar(row.brand_display) }}</span>
                  {{ row.brand_display }}
                </span>
                <span v-else class="dim">—</span>
              </template>
            </el-table-column>
            <el-table-column prop="series" label="系列" width="84">
              <template #default="{ row }"><span class="dim">{{ row.series || '—' }}</span></template>
            </el-table-column>
            <el-table-column label="报价" width="96" align="right">
              <template #default="{ row }">
                <b class="price">¥{{ fmtNum(row.quote_price) }}</b><span class="unit">/{{ row.quote_unit || '件' }}</span>
              </template>
            </el-table-column>
            <el-table-column label="成本" width="82" align="right">
              <template #default="{ row }">¥{{ fmtNum(row.cost_price2) }}</template>
            </el-table-column>
            <el-table-column label="毛利率" width="76" align="center">
              <template #default="{ row }">
                <span class="profit" :class="{ low: profitOf(row) < 25 }">{{ profitOf(row) }}%</span>
              </template>
            </el-table-column>
            <el-table-column label="商城" width="80" align="center">
              <template #default="{ row }">
                <span class="mstat" :class="{ on: row.mall_status === 1 }">
                  {{ row.mall_status === 1 ? '在售' : '未上架' }}
                </span>
              </template>
            </el-table-column>
            <el-table-column label="操作" width="112" fixed="right">
              <template #default="{ row }">
                <el-button link type="primary" size="small" @click="openEdit(row)">编辑</el-button>
                <el-button link type="danger" size="small" @click="doDelete(row)">删除</el-button>
              </template>
            </el-table-column>
          </el-table>
        </div>

        <!-- 品牌墙 -->
        <div v-else class="brandwall">
          <div v-for="b in wallBrands" :key="b.id" class="bcard" :class="{ on: f.brandIds.includes(b.id) }" @click="toggleBrand(b.id)">
            <div class="bcard-top">
              <span class="logo lg" :style="{ background: logoColor(b.name) }">{{ logoChar(b.name) }}</span>
              <div>
                <div class="bcard-name">{{ b.name }}</div>
                <div class="bcard-sub">{{ b.catNames || '暂无品类' }}</div>
              </div>
            </div>
            <div class="bcard-foot">
              <b>{{ b.count }}</b>个商品
              <span class="rt">{{ f.brandIds.includes(b.id) ? '已选' : '点击筛选' }}</span>
            </div>
          </div>
          <div v-if="!wallBrands.length" class="empty">当前筛选下没有品牌</div>
        </div>

        <div v-if="view !== 'wall'" class="pager">
          <span>共 {{ total }} 条</span>
          <span class="sp"></span>
          <el-pagination
            v-model:current-page="page" v-model:page-size="pageSize"
            :page-sizes="[20, 50, 100, 200]" :total="total"
            layout="sizes, prev, pager, next, jumper" @current-change="loadList" @size-change="onSizeChange"
          />
        </div>
      </div>
    </section>

    <!-- ============ 编辑弹窗 ============ -->
    <el-dialog v-model="editVisible" :title="isEdit ? '编辑商品' : '新增商品'" width="960px" top="5vh" destroy-on-close>
      <el-tabs v-model="editTab">
        <el-tab-pane label="基础信息" name="base">
          <el-form :model="form" label-width="96px" class="edit-form">
            <el-row :gutter="14">
              <el-col :span="8"><el-form-item label="名称" required><el-input v-model="form.name" placeholder="必填" /></el-form-item></el-col>
              <el-col :span="8"><el-form-item label="系统编号"><el-input v-model="form.code" /></el-form-item></el-col>
              <el-col :span="8"><el-form-item label="排序"><el-input-number v-model="form.sort_order" :min="0" style="width:100%" /></el-form-item></el-col>

              <el-col :span="8">
                <el-form-item label="类型">
                  <el-select v-model="form.type_id" clearable placeholder="选择类型" style="width:100%" @change="onFormTypeChange">
                    <el-option v-for="t in tree" :key="t.id" :label="t.name" :value="t.id" />
                  </el-select>
                </el-form-item>
              </el-col>
              <el-col :span="8">
                <el-form-item label="品类">
                  <el-select v-model="form.category_id" clearable placeholder="选择品类" style="width:100%" @change="onFormCatChange">
                    <el-option v-for="c in formCats" :key="c.id" :label="c.name" :value="c.id" />
                  </el-select>
                </el-form-item>
              </el-col>
              <el-col :span="8">
                <el-form-item label="子类">
                  <el-select v-model="form.sub_id" clearable placeholder="选择子类" style="width:100%">
                    <el-option v-for="s in formSubs" :key="s.id" :label="s.name" :value="s.id" />
                  </el-select>
                </el-form-item>
              </el-col>

              <el-col :span="8">
                <el-form-item label="品牌">
                  <el-select v-model="form.brand_id" clearable filterable allow-create default-first-option
                    placeholder="选择或输入品牌" style="width:100%" @change="onFormBrandChange">
                    <el-option v-for="b in brands" :key="b.id" :label="b.name" :value="b.id" />
                  </el-select>
                </el-form-item>
              </el-col>
              <el-col :span="8"><el-form-item label="系列"><el-input v-model="form.series" placeholder="如 尚韵 / 皓彩" /></el-form-item></el-col>
              <el-col :span="8">
                <el-form-item label="供应商">
                  <el-select v-model="form.supplier_id" clearable filterable placeholder="选择供应商" style="width:100%">
                    <el-option v-for="s in suppliers" :key="s.id" :label="s.name" :value="s.id" />
                  </el-select>
                </el-form-item>
              </el-col>

              <el-col :span="8"><el-form-item label="规格"><el-input v-model="form.specification" placeholder="如 800×800" /></el-form-item></el-col>
              <el-col :span="8"><el-form-item label="型号"><el-input v-model="form.model" /></el-form-item></el-col>
              <el-col :span="8"><el-form-item label="颜色"><el-input v-model="form.color" /></el-form-item></el-col>

              <el-col :span="8"><el-form-item label="规格备选"><el-input v-model="form.spec_alternative" /></el-form-item></el-col>
              <el-col :span="8"><el-form-item label="型号备选"><el-input v-model="form.model_alternative" /></el-form-item></el-col>
              <el-col :span="8"><el-form-item label="颜色备选"><el-input v-model="form.color_alternative" /></el-form-item></el-col>

              <el-col :span="8"><el-form-item label="显示"><el-switch v-model="form.is_visible" :active-value="1" :inactive-value="0" /></el-form-item></el-col>
              <el-col :span="8"><el-form-item label="固定"><el-switch v-model="form.is_fixed" :active-value="1" :inactive-value="0" /></el-form-item></el-col>
            </el-row>
          </el-form>
        </el-tab-pane>

        <el-tab-pane label="价格" name="price">
          <el-form :model="form" label-width="110px" class="edit-form">
            <el-row :gutter="14">
              <el-col :span="8"><el-form-item label="报价"><el-input-number v-model="form.quote_price" :min="0" :precision="2" style="width:100%" /></el-form-item></el-col>
              <el-col :span="8"><el-form-item label="成本价"><el-input-number v-model="form.cost_price2" :min="0" :precision="2" style="width:100%" /></el-form-item></el-col>
              <el-col :span="8"><el-form-item label="核算价"><el-input-number v-model="form.cost_price" :min="0" :precision="2" style="width:100%" /></el-form-item></el-col>

              <el-col :span="8"><el-form-item label="原价"><el-input-number v-model="form.original_price" :min="0" :precision="2" style="width:100%" /></el-form-item></el-col>
              <el-col :span="8"><el-form-item label="发包价"><el-input-number v-model="form.contract_price" :min="0" :precision="2" style="width:100%" /></el-form-item></el-col>
              <el-col :span="8"><el-form-item label="内控单价"><el-input-number v-model="form.internal_control_price" :min="0" :precision="2" style="width:100%" /></el-form-item></el-col>

              <el-col :span="8"><el-form-item label="报价单位"><el-input v-model="form.quote_unit" placeholder="片 / 米 / ㎡" /></el-form-item></el-col>
              <el-col :span="8"><el-form-item label="采购单位"><el-input v-model="form.purchase_unit" /></el-form-item></el-col>
              <el-col :span="8"><el-form-item label="兑换比例"><el-input-number v-model="form.exchange_rate" :min="0" :precision="2" style="width:100%" /></el-form-item></el-col>

              <el-col :span="8"><el-form-item label="损耗比例"><el-input-number v-model="form.loss_rate" :min="0" :precision="2" style="width:100%" /></el-form-item></el-col>
              <el-col :span="8"><el-form-item label="损耗金额"><el-input-number v-model="form.loss_amount" :min="0" :precision="2" style="width:100%" /></el-form-item></el-col>
              <el-col :span="8"><el-form-item label="升级利润率"><el-input-number v-model="form.upgrade_profit_rate" :min="0" :precision="2" style="width:100%" /></el-form-item></el-col>
            </el-row>
            <div class="form-tip">
              当前毛利率：<b>{{ profitOf(form) }}%</b>
              <span class="dim">（= (报价 − 成本价) / 报价）</span>
            </div>
          </el-form>
        </el-tab-pane>

        <el-tab-pane label="主图与商城" name="media">
          <el-form :model="form" label-width="96px" class="edit-form">
            <el-form-item label="主图">
              <div class="cover-box">
                <div class="cover-preview">
                  <el-image v-if="form.cover_image" :src="assetUrl(form.cover_image)" fit="cover" style="width:100%;height:100%" />
                  <div v-else class="ph-none"><el-icon><Picture /></el-icon><span>无主图</span></div>
                </div>
                <div class="cover-ops">
                  <el-upload
                    :show-file-list="false" action="/api/upload-image" name="file"
                    :headers="uploadHeaders"
                    accept="image/*" :on-success="onCoverOk" :on-error="onCoverErr"
                  >
                    <el-button size="small" type="primary" plain>上传主图</el-button>
                  </el-upload>
                  <el-button v-if="form.cover_image" size="small" text type="danger" @click="form.cover_image = ''">移除</el-button>
                  <div class="dim" style="font-size:12px;margin-top:6px;line-height:1.6">
                    建议 4:3，不小于 800×600。<br>主图会用在卡片、表格缩略图和商城。
                  </div>
                </div>
              </div>
            </el-form-item>

            <el-divider content-position="left">商城（预留，接商城后生效）</el-divider>
            <el-row :gutter="14">
              <el-col :span="8">
                <el-form-item label="上架状态">
                  <el-select v-model="form.mall_status" style="width:100%">
                    <el-option label="未上架" :value="0" />
                    <el-option label="已上架" :value="1" />
                    <el-option label="已下架" :value="2" />
                  </el-select>
                </el-form-item>
              </el-col>
              <el-col :span="8"><el-form-item label="商城价"><el-input-number v-model="form.mall_price" :min="0" :precision="2" style="width:100%" /></el-form-item></el-col>
              <el-col :span="8"><el-form-item label="商城库存"><el-input-number v-model="form.mall_stock" :min="0" style="width:100%" /></el-form-item></el-col>
              <el-col :span="12"><el-form-item label="商城 SKU"><el-input v-model="form.mall_sku_code" placeholder="对接外部商城的商品编码" /></el-form-item></el-col>
            </el-row>
          </el-form>
        </el-tab-pane>

        <el-tab-pane label="备注" name="remark">
          <el-form :model="form" label-width="96px" class="edit-form">
            <el-form-item label="备注说明"><el-input v-model="form.remark" type="textarea" :rows="3" /></el-form-item>
            <el-form-item label="验收说明"><el-input v-model="form.acceptance_remark" type="textarea" :rows="3" /></el-form-item>
            <el-form-item label="发包备注"><el-input v-model="form.contract_remark" type="textarea" :rows="2" /></el-form-item>
            <el-form-item label="其他备注"><el-input v-model="form.other_remark" type="textarea" :rows="2" /></el-form-item>
          </el-form>
        </el-tab-pane>

        <el-tab-pane label="高级" name="adv">
          <el-form :model="form" label-width="110px" class="edit-form">
            <el-row :gutter="14">
              <el-col :span="8"><el-form-item label="保修时长"><el-input v-model="form.warranty_period" placeholder="如 2年" /></el-form-item></el-col>
              <el-col :span="8"><el-form-item label="备货周期"><el-input v-model="form.stock_period" placeholder="如 7天" /></el-form-item></el-col>
              <el-col :span="8"><el-form-item label="位置"><el-input v-model="form.position" /></el-form-item></el-col>
              <el-col :span="8"><el-form-item label="套系"><el-input v-model="form.package_name" /></el-form-item></el-col>
              <el-col :span="8"><el-form-item label="组合"><el-input v-model="form.combo" /></el-form-item></el-col>
              <el-col :span="8"><el-form-item label="限量公式"><el-input v-model="form.limit_formula" /></el-form-item></el-col>
              <el-col :span="12"><el-form-item label="报价量公式"><el-input v-model="form.quote_formula" /></el-form-item></el-col>
            </el-row>
          </el-form>
        </el-tab-pane>
      </el-tabs>

      <template #footer>
        <el-button @click="editVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="save">保存</el-button>
      </template>
    </el-dialog>

    <!-- ============ 品类管理抽屉 ============ -->
    <el-drawer v-model="catMgrVisible" title="品类管理" size="620px">
      <div class="dr-tip">
        品类用 <code>id</code> 关联，不存中文名。改名只影响展示，不动商品数据；
        <code>code</code> 一旦生成不可改（商城 / 报价 / Excel 靠它对接）。
      </div>
      <el-table :data="flatCats" size="small" border height="calc(100vh - 220px)">
        <el-table-column prop="code" label="编码" width="170">
          <template #default="{ row }"><code class="code-cell">{{ row.code }}</code></template>
        </el-table-column>
        <el-table-column prop="name" label="名称" min-width="150">
          <template #default="{ row }">
            <span :style="{ paddingLeft: (row.level - 1) * 14 + 'px' }">{{ row.level > 1 ? '└ ' : '' }}{{ row.name }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="parent_name" label="上级" width="110" />
        <el-table-column prop="count" label="商品数" width="80" align="right" />
        <el-table-column label="状态" width="80" align="center">
          <template #default="{ row }">
            <el-tag v-if="row.status === 1" size="small" type="success">启用</el-tag>
            <el-tag v-else size="small" type="info">停用</el-tag>
          </template>
        </el-table-column>
      </el-table>
    </el-drawer>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import axios from 'axios'
import { authHeaders } from '@/utils/authHeaders'
import { ElMessage, ElMessageBox } from 'element-plus'

/* ---------------- 常量 ---------------- */
const QUICKS = [
  { k: '', label: '全部' },
  { k: 'noimg', label: '缺主图' },
  { k: 'nocat', label: '未定品类' },
  { k: 'mall', label: '已上架' },
  { k: 'lowprofit', label: '毛利 < 25%' },
  { k: 'nobrand', label: '无品牌' }
]

const LOGO_COLORS = ['#2F6FEB', '#C77B2E', '#1E8E5A', '#8B5CF6', '#D9534F', '#0EA5A5', '#4F46E5', '#B45309', '#0891B2', '#BE185D']

/* ---------------- 状态 ---------------- */
const loading = ref(false)
const saving = ref(false)
const list = ref([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(20)
const view = ref('card')

const tree = ref([])
const brands = ref([])
const suppliers = ref([])
const seriesOptions = ref([])
const facets = reactive({ total: 0, quick: {}, types: [], categories: [], subs: [], brands: [] })

const f = reactive({
  keyword: '', type_id: null, category_id: null, sub_id: null,
  brandIds: [], series: '', quick: '', sort: 'default'
})

const expanded = reactive(new Set())

/* el-upload 走的是自己的 XHR，不经过 main.js 的 axios 拦截器，
   必须显式补权限头，否则导入 / 上传会被后端当游客拒掉。
   v2.5.3：取值逻辑已抽到 utils/authHeaders.js，和全局 axios 拦截器共用一份口径。 */
const uploadHeaders = computed(() => authHeaders())

/* ---------------- 工具 ---------------- */
const assetUrl = (p) => {
  if (!p) return ''
  if (/^https?:/i.test(p)) return p
  return p.startsWith('/') ? p : '/' + p
}
const toNum = (v) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}
const fmtNum = (v) => {
  const n = toNum(v)
  return Number.isInteger(n) ? n.toLocaleString() : n.toFixed(2)
}
const profitOf = (row) => {
  const q = toNum(row && row.quote_price)
  const c = toNum(row && row.cost_price2)
  if (q <= 0) return 0
  return Math.round((q - c) / q * 100)
}
const logoColor = (name) => {
  let h = 0
  for (const ch of String(name || '?')) h = (h * 31 + ch.charCodeAt(0)) % 997
  return LOGO_COLORS[h % LOGO_COLORS.length]
}
const logoChar = (name) => String(name || '?').trim().charAt(0).toUpperCase()
const typeCls = (t) => (t === '辅材' ? 'fu' : t === '家具家电' ? 'jia' : '')
const typeIcon = (code) => (code === 'aux' ? 'i2' : code === 'furniture' ? 'i3' : 'i1')

const totalAll = computed(() => facets.total || facets.quick.all || 0)

/* ---------------- 已选条件 ---------------- */
const activeChips = computed(() => {
  const arr = []
  if (f.type_id) {
    const t = tree.value.find(x => x.id === f.type_id)
    if (t) arr.push({ k: 'type_id', t: t.name })
  }
  if (f.category_id) {
    for (const t of tree.value) {
      const c = t.children.find(x => x.id === f.category_id)
      if (c) { arr.push({ k: 'category_id', t: c.name }); break }
    }
  }
  if (f.sub_id) {
    outer: for (const t of tree.value) {
      for (const c of t.children) {
        const s = c.children.find(x => x.id === f.sub_id)
        if (s) { arr.push({ k: 'sub_id', t: s.name }); break outer }
      }
    }
  }
  f.brandIds.forEach(id => {
    const b = brands.value.find(x => x.id === id)
    arr.push({ k: 'brand', v: id, t: '品牌：' + (b ? b.name : id) })
  })
  if (f.series) arr.push({ k: 'series', t: '系列：' + f.series })
  if (f.keyword) arr.push({ k: 'keyword', t: '关键词：' + f.keyword })
  if (f.quick) {
    const q = QUICKS.find(x => x.k === f.quick)
    if (q) arr.push({ k: 'quick', t: q.label })
  }
  return arr
})

const removeChip = (c) => {
  if (c.k === 'brand') {
    f.brandIds = f.brandIds.filter(x => x !== c.v)
  } else if (c.k === 'category_id') {
    f.category_id = null; f.sub_id = null
  } else if (c.k === 'type_id') {
    f.type_id = null; f.category_id = null; f.sub_id = null
  } else {
    f[c.k] = ''
  }
  reload()
}
const clearAll = () => {
  f.keyword = ''; f.type_id = null; f.category_id = null; f.sub_id = null
  f.brandIds = []; f.series = ''; f.quick = ''; f.sort = 'default'
  page.value = 1
  reload()
}
const quickSearch = (kw) => { f.keyword = kw; page.value = 1; reload() }

/* ---------------- 树交互 ---------------- */
const toggleExpand = (key) => {
  if (expanded.has(key)) expanded.delete(key)
  else expanded.add(key)
}
const pickNode = (payload) => {
  f.type_id = payload.type_id || null
  f.category_id = payload.category_id || null
  f.sub_id = payload.sub_id || null
  if (payload.type_id) expanded.add('t' + payload.type_id)
  if (payload.category_id) expanded.add('c' + payload.category_id)
  view.value = 'card'
  page.value = 1
  reload()
}

/* ---------------- 筛选动作 ---------------- */
let searchTimer = null
const onSearchInput = () => {
  if (searchTimer) clearTimeout(searchTimer)
  searchTimer = setTimeout(() => { page.value = 1; reload() }, 320)
}
const setQuick = (k) => { f.quick = k; page.value = 1; reload() }
const setView = (v) => { view.value = v }
const toggleWall = () => {
  view.value = view.value === 'wall' ? 'card' : 'wall'
}
const toggleBrand = (id) => {
  const i = f.brandIds.indexOf(id)
  if (i >= 0) f.brandIds.splice(i, 1)
  else f.brandIds.push(id)
  reload()
}
const onSizeChange = () => { page.value = 1; loadList() }

/* ---------------- 数据加载 ---------------- */
const buildParams = () => {
  const p = { page: page.value, limit: pageSize.value, sort: f.sort }
  if (f.keyword) p.keyword = f.keyword.trim()
  if (f.type_id) p.type_id = f.type_id
  if (f.category_id) p.category_id = f.category_id
  if (f.sub_id) p.sub_id = f.sub_id
  if (f.brandIds.length) p.brand_ids = f.brandIds.join(',')
  if (f.series) p.series = f.series
  if (f.quick) p.quick = f.quick
  return p
}

const loadList = async () => {
  loading.value = true
  try {
    const { data } = await axios.get('/api/main-materials', { params: buildParams() })
    list.value = data.list || []
    total.value = data.total || 0
  } catch (e) {
    ElMessage.error(e?.response?.data?.error || '加载失败')
    list.value = []
    total.value = 0
  } finally {
    loading.value = false
  }
}

const loadFacets = async () => {
  try {
    const params = buildParams()
    delete params.page; delete params.limit
    const { data } = await axios.get('/api/main-materials/facets', { params })
    facets.total = data.total || 0
    facets.quick = data.quick || {}
    facets.types = data.types || []
    facets.categories = data.categories || []
    facets.subs = data.subs || []
    facets.brands = data.brands || []
    seriesOptions.value = data.series || []
    applyFacetCounts()
  } catch (e) {
    // facets 失败不影响主列表
    console.warn('facets 加载失败', e)
  }
}

// 把 facets 的计数贴回树和品牌上
const applyFacetCounts = () => {
  const tMap = new Map(facets.types.map(x => [x.id, x.count]))
  const cMap = new Map(facets.categories.map(x => [x.id, x.count]))
  const sMap = new Map(facets.subs.map(x => [x.id, x.count]))
  const bMap = new Map(facets.brands.map(x => [x.id, x.count]))
  tree.value.forEach(t => {
    t.count = tMap.get(t.id) || 0
    t.children.forEach(c => {
      c.count = cMap.get(c.id) || 0
      c.children.forEach(s => { s.count = sMap.get(s.id) || 0 })
    })
  })
  brands.value.forEach(b => { b.count = bMap.get(b.id) || 0 })
}

const reload = () => {
  loadList()
  loadFacets()
}

const loadTree = async () => {
  const { data } = await axios.get('/api/material-categories/tree')
  tree.value = Array.isArray(data) ? data : []
  // 默认展开第一个类型和它第一个品类
  if (tree.value.length) {
    expanded.add('t' + tree.value[0].id)
    if (tree.value[0].children.length) expanded.add('c' + tree.value[0].children[0].id)
  }
  applyFacetCounts()
}

const loadBrands = async () => {
  const { data } = await axios.get('/api/material-brands', { params: { with_count: 1 } })
  brands.value = Array.isArray(data) ? data : []
}

const loadSuppliers = async () => {
  try {
    const { data } = await axios.get('/api/external-contacts', { params: { category: '供应商', is_active: 1 } })
    suppliers.value = data?.list || []
  } catch (e) { suppliers.value = [] }
}

/* ---------------- 品牌墙 ---------------- */
// 主营品类由后端 /api/material-brands?with_count=1 聚合返回（cat_names），
// 前端不再自行反查 tree（facets 与品牌是两个维度，反查不到对应关系）。
const wallBrands = computed(() => {
  return brands.value
    .filter(b => (b.count || 0) > 0)
    .map(b => Object.assign({}, b, { catNames: b.cat_names || '' }))
})

/* ---------------- 编辑 ---------------- */
const editVisible = ref(false)
const isEdit = ref(false)
const editTab = ref('base')

const blankForm = () => ({
  id: null, code: '', name: '', sort_order: 0,
  type_id: null, category_id: null, sub_id: null, brand_id: null, series: '',
  supplier_id: null, supplier_name: '',
  specification: '', model: '', color: '',
  spec_alternative: '', model_alternative: '', color_alternative: '',
  is_visible: 1, is_fixed: 0,
  quote_price: 0, cost_price2: 0, cost_price: 0, original_price: 0,
  contract_price: 0, internal_control_price: 0,
  quote_unit: '片', purchase_unit: '', exchange_rate: 1,
  loss_rate: 0, loss_amount: 0, upgrade_profit_rate: 0,
  cover_image: '', gallery: '',
  mall_status: 0, mall_price: null, mall_stock: 0, mall_sku_code: '',
  remark: '', acceptance_remark: '', contract_remark: '', other_remark: '',
  warranty_period: '', stock_period: '', position: '', package_name: '',
  combo: '', limit_formula: '', quote_formula: ''
})
const form = reactive(blankForm())

const formCats = computed(() => {
  const t = tree.value.find(x => x.id === form.type_id)
  return t ? t.children : []
})
const formSubs = computed(() => {
  const c = formCats.value.find(x => x.id === form.category_id)
  return c ? c.children : []
})

const onFormTypeChange = () => { form.category_id = null; form.sub_id = null }
const onFormCatChange = () => { form.sub_id = null }
const onFormBrandChange = () => { /* brand_id 直接提交，后端会回填 brand 名 */ }

const openCreate = () => {
  Object.assign(form, blankForm())
  // 沿用当前筛选，减少重复选择
  form.type_id = f.type_id || null
  form.category_id = f.category_id || null
  form.sub_id = f.sub_id || null
  isEdit.value = false
  editTab.value = 'base'
  editVisible.value = true
}

const openEdit = (row) => {
  Object.assign(form, blankForm(), {
    ...row,
    mall_price: row.mall_price == null ? null : toNum(row.mall_price)
  })
  isEdit.value = true
  editTab.value = 'base'
  editVisible.value = true
}

const save = async () => {
  if (!form.name) { ElMessage.warning('请填写商品名称'); return }
  saving.value = true
  try {
    const payload = { ...form }
    // 只提交需要的字段，避免把 join 出来的只读字段带回去
    delete payload.type_name; delete payload.category_name; delete payload.sub_name
    delete payload.brand_name; delete payload.brand_logo; delete payload.brand_display
    delete payload.brand
    if (isEdit.value) {
      await axios.put(`/api/main-materials/${form.id}`, payload)
      ElMessage.success('已保存')
    } else {
      await axios.post('/api/main-materials', payload)
      ElMessage.success('已新增')
    }
    editVisible.value = false
    reload()
    loadBrands()
  } catch (e) {
    ElMessage.error(e?.response?.data?.error || '保存失败')
  } finally {
    saving.value = false
  }
}

const doDelete = async (row) => {
  try {
    await ElMessageBox.confirm(`确认删除「${row.name}」？`, '提示', { type: 'warning' })
  } catch (e) { return }
  try {
    await axios.delete(`/api/main-materials/${row.id}`)
    ElMessage.success('已删除')
    reload()
  } catch (e) {
    ElMessage.error(e?.response?.data?.error || '删除失败')
  }
}

/* ---------------- 图片上传 ---------------- */
const onCoverOk = (res) => {
  if (res && res.url) {
    form.cover_image = res.url
    ElMessage.success('主图已上传，记得保存')
  } else {
    ElMessage.error('上传返回异常')
  }
}
const onCoverErr = (err) => {
  let msg = '上传失败'
  try {
    msg = JSON.parse(err.message).error || msg
  } catch (e) { /* ignore */ }
  ElMessage.error(msg)
}

/* ---------------- 导入导出 ---------------- */
const onImportOk = (res) => {
  if (res && res.count !== undefined) {
    ElMessage.success(res.message || `导入成功 ${res.count} 条`)
  } else {
    ElMessage.success('导入完成')
  }
  reload()
  loadBrands()
}
const onImportErr = (err) => {
  let msg = '导入失败'
  try {
    msg = JSON.parse(err.message).message || msg
  } catch (e) { /* ignore */ }
  ElMessage.error(msg)
}
const doExport = async () => {
  try {
    const resp = await axios.get('/api/main-materials/export', { responseType: 'blob' })
    const blob = new Blob([resp.data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = '主材管理导出.xlsx'
    a.click()
    window.URL.revokeObjectURL(url)
  } catch (e) {
    ElMessage.error('导出失败')
  }
}

/* ---------------- 品类管理 ---------------- */
const catMgrVisible = ref(false)
const flatCats = computed(() => {
  const arr = []
  const walk = (nodes, parentName) => {
    nodes.forEach(n => {
      arr.push({
        id: n.id, code: n.code, name: n.name, level: n.level,
        parent_name: parentName || '—', count: n.count, status: 1
      })
      if (n.children && n.children.length) walk(n.children, n.name)
    })
  }
  walk(tree.value, '')
  return arr
})
const openCatMgr = () => { catMgrVisible.value = true }

/* ---------------- 初始化 ---------------- */
onMounted(async () => {
  await Promise.all([loadTree(), loadBrands(), loadSuppliers()])
  await reload()
})
</script>

<style scoped>
.mm-page {
  display: flex;
  gap: 14px;
  height: calc(100vh - 100px);
  min-height: 560px;
  color: #1F2937;
}

/* ---------- 左：品类树 ---------- */
.mm-side {
  width: 240px; flex: 0 0 240px; background: #fff; border: 1px solid #E8EBF0;
  border-radius: 10px; display: flex; flex-direction: column; overflow: hidden;
}
.side-head { padding: 14px 14px 11px; border-bottom: 1px solid #F2F4F7; }
.side-title { font-size: 15px; font-weight: 600; color: #1E3A5F; letter-spacing: .4px; display: flex; align-items: center; gap: 6px; }
.side-title .dot { width: 6px; height: 6px; border-radius: 50%; background: #2F6FEB; }
.side-sub { font-size: 11.5px; color: #98A1AE; margin-top: 4px; }
.side-tools { display: flex; gap: 6px; margin-top: 10px; }
.mini-btn {
  flex: 1; height: 26px; border: 1px solid #E8EBF0; background: #fff; border-radius: 6px;
  font-size: 12px; color: #5B6472; cursor: pointer; display: flex; align-items: center;
  justify-content: center; gap: 4px; transition: all .15s;
}
.mini-btn:hover { border-color: #C3D4EC; color: #2F6FEB; background: #FAFCFF; }
.mini-btn.on { background: #EEF3FA; border-color: #C3D4EC; color: #2F6FEB; font-weight: 600; }

.tree { flex: 1; overflow-y: auto; padding: 8px 8px 14px; }
.tree::-webkit-scrollbar { width: 6px; }
.tree::-webkit-scrollbar-thumb { background: #DDE2EA; border-radius: 3px; }

.node {
  display: flex; align-items: center; gap: 7px; border-radius: 7px; cursor: pointer;
  transition: background .12s, color .12s; position: relative; user-select: none;
}
.node:hover { background: #F2F4F7; }
.node.active { background: #EEF3FA; color: #2F6FEB; font-weight: 600; }
.node.active::before {
  content: ''; position: absolute; left: 0; top: 50%; transform: translateY(-50%);
  width: 3px; height: 13px; border-radius: 2px; background: #2F6FEB;
}
.node.lv0 { padding: 9px 10px; font-size: 13.5px; font-weight: 600; margin-top: 3px; }
.node.lv1 { padding: 6px 10px 6px 28px; font-size: 13px; color: #5B6472; }
.node.lv2 { padding: 5px 10px 5px 54px; font-size: 12.5px; color: #5B6472; }
.node.lv2::after {
  content: ''; position: absolute; left: 43px; top: 50%; width: 7px; height: 1px; background: #DDE3EB;
}
.node .cnt { margin-left: auto; font-size: 11px; color: #98A1AE; flex: 0 0 auto; }
.node.active .cnt { color: #2F6FEB; }
.node .ico {
  width: 19px; height: 19px; border-radius: 5px; flex: 0 0 19px; display: grid;
  place-items: center; font-size: 10.5px; color: #fff; font-weight: 700;
}
.ico.i0 { background: linear-gradient(135deg, #1E3A5F, #3D6390); }
.ico.i1 { background: linear-gradient(135deg, #2F6FEB, #5B93F5); }
.ico.i2 { background: linear-gradient(135deg, #1E8E5A, #4CB57F); }
.ico.i3 { background: linear-gradient(135deg, #C77B2E, #E0A25E); }
.node .caret {
  width: 13px; height: 13px; flex: 0 0 13px; display: grid; place-items: center;
  font-size: 8px; color: #98A1AE; transition: transform .18s; margin-left: -2px;
}
.node .caret.open { transform: rotate(90deg); }
.side-foot { padding: 9px 14px; border-top: 1px solid #F2F4F7; font-size: 11px; color: #98A1AE; line-height: 1.65; }

/* ---------- 右：主区 ---------- */
.mm-main {
  flex: 1; min-width: 0; display: flex; flex-direction: column;
  background: #fff; border: 1px solid #E8EBF0; border-radius: 10px; overflow: hidden;
}
.mm-top { display: flex; align-items: center; gap: 14px; padding: 0 18px; height: 56px; flex: 0 0 56px; border-bottom: 1px solid #E8EBF0; }
.crumb { font-size: 13px; color: #98A1AE; white-space: nowrap; }
.crumb b { color: #1F2937; font-weight: 600; font-size: 15px; margin-left: 2px; }
.top-stats { display: flex; gap: 22px; margin-left: 16px; padding-left: 16px; border-left: 1px solid #E8EBF0; }
.ts { font-size: 11px; color: #98A1AE; line-height: 1.4; white-space: nowrap; }
.ts b { display: block; font-size: 16px; color: #1F2937; font-weight: 700; line-height: 1.3; font-variant-numeric: tabular-nums; }
.ts.warn b { color: #D97706; }
.top-actions { margin-left: auto; display: flex; gap: 8px; align-items: center; }

.mm-toolbar { padding: 11px 18px 0; border-bottom: 1px solid #F2F4F7; flex: 0 0 auto; }
.tb-row { display: flex; align-items: center; gap: 9px; flex-wrap: wrap; }
.search { width: 300px; }
.w-brand { width: 170px; }
.w-series { width: 150px; }
.w-sort { width: 140px; }
.viewswitch { margin-left: auto; display: flex; gap: 3px; background: #F2F4F7; border-radius: 8px; padding: 2px; }
.viewswitch button {
  border: 0; background: transparent; height: 28px; padding: 0 11px; border-radius: 6px;
  cursor: pointer; font-size: 13px; color: #5B6472; transition: all .15s;
}
.viewswitch button.on { background: #fff; color: #1E3A5F; font-weight: 600; box-shadow: 0 1px 3px rgba(16,24,40,.08); }

.quickbar { display: flex; align-items: center; gap: 7px; padding: 9px 0 10px; flex-wrap: wrap; }
.quickbar .lab { font-size: 12px; color: #98A1AE; }
.qchip {
  height: 25px; padding: 0 10px; border-radius: 13px; border: 1px solid #E8EBF0; background: #fff;
  font-size: 12px; color: #5B6472; cursor: pointer; transition: all .15s; display: inline-flex; align-items: center; gap: 4px;
}
.qchip:hover { border-color: #C3D4EC; color: #2F6FEB; }
.qchip.on { background: #1E3A5F; border-color: #1E3A5F; color: #fff; font-weight: 500; }
.qchip .n { font-size: 10.5px; opacity: .75; }

.chipbar { display: flex; align-items: center; gap: 7px; padding: 0 0 10px; flex-wrap: wrap; }
.chipbar .lab { font-size: 12px; color: #98A1AE; }
.chip {
  height: 24px; padding: 0 6px 0 9px; border-radius: 12px; background: #EEF3FA; color: #1E3A5F;
  font-size: 12px; display: inline-flex; align-items: center; gap: 5px; border: 1px solid #DCE8F8;
}
.chip .x { cursor: pointer; opacity: .5; font-size: 11px; padding: 0 2px; }
.chip .x:hover { opacity: 1; }
.chipbar .clr { font-size: 12px; color: #98A1AE; cursor: pointer; margin-left: 2px; }
.chipbar .clr:hover { color: #C0392B; }

.mm-content { flex: 1; overflow-y: auto; padding: 14px 18px 18px; min-height: 0; }
.mm-content::-webkit-scrollbar { width: 8px; }
.mm-content::-webkit-scrollbar-thumb { background: #DDE2EA; border-radius: 4px; }

/* ---------- 卡片 ---------- */
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: 14px; }
.card {
  background: #fff; border: 1px solid #E8EBF0; border-radius: 10px; overflow: hidden;
  cursor: pointer; transition: all .18s; display: flex; flex-direction: column;
}
.card:hover { border-color: #C3D4EC; box-shadow: 0 6px 18px rgba(30,58,95,.09); transform: translateY(-2px); }
.thumb { position: relative; aspect-ratio: 16/10; overflow: hidden; background: #F0F2F5; }
.ph-img { width: 100%; height: 100%; transition: transform .35s; }
.card:hover .ph-img { transform: scale(1.05); }
.ph-none {
  position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center;
  justify-content: center; gap: 4px; color: #AEB6C1; font-size: 11.5px;
  background: repeating-linear-gradient(45deg, #F4F6F8 0 10px, #EDF0F3 10px 20px);
}
.ph-none .el-icon { font-size: 22px; }
.tag {
  position: absolute; left: 8px; top: 8px; font-size: 11px; line-height: 18px; padding: 0 7px;
  border-radius: 5px; background: rgba(255,255,255,.93); color: #1E3A5F; font-weight: 600;
  box-shadow: 0 1px 3px rgba(0,0,0,.08);
}
.tag.fu { color: #1E8E5A; }
.tag.jia { color: #C77B2E; }
.mall {
  position: absolute; right: 8px; top: 8px; font-size: 10.5px; line-height: 18px; padding: 0 6px;
  border-radius: 5px; background: #2F6FEB; color: #fff; font-weight: 500;
}
.mall.off { background: rgba(255,255,255,.94); color: #7A828E; box-shadow: 0 0 0 1px rgba(0,0,0,.06); }
.thumb-logo {
  position: absolute; right: 8px; bottom: 8px; width: 24px; height: 24px; border-radius: 6px;
  display: grid; place-items: center; font-size: 12px; font-weight: 700; color: #fff;
  box-shadow: 0 2px 6px rgba(0,0,0,.18);
}
.card-body { padding: 10px 12px 11px; display: flex; flex-direction: column; gap: 4px; flex: 1; }
.c-name { font-size: 14px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.c-meta { font-size: 12px; color: #98A1AE; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.c-path { display: flex; align-items: center; gap: 4px; font-size: 11.5px; color: #98A1AE; overflow: hidden; }
.c-path .b { color: #2F6FEB; background: #F2F7FF; padding: 0 5px; border-radius: 3px; flex: 0 0 auto; }
.c-path .s { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.c-price-row { display: flex; align-items: baseline; gap: 9px; margin-top: 3px; }
.c-price { font-size: 18px; font-weight: 700; color: #1E3A5F; font-variant-numeric: tabular-nums; }
.c-price i { font-size: 12px; font-style: normal; font-weight: 600; margin-right: 1px; }
.c-price .u { font-size: 11.5px; font-weight: 400; color: #98A1AE; margin-left: 2px; }
.profit { font-size: 11px; padding: 1px 6px; border-radius: 4px; font-weight: 600; background: #EAF7F0; color: #1E8E5A; }
.profit.low { background: #FDF0EE; color: #C0392B; }
.c-foot {
  display: flex; align-items: center; gap: 6px; margin-top: 4px; padding-top: 7px;
  border-top: 1px dashed #F2F4F7; font-size: 11.5px; color: #98A1AE;
}
.c-foot .sp { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.c-foot .code { margin-left: auto; flex: 0 0 auto; }

/* ---------- 表格 ---------- */
.tablewrap { background: #fff; }
.tcell { display: flex; align-items: center; gap: 10px; }
.timg { width: 38px; height: 38px; border-radius: 7px; overflow: hidden; flex: 0 0 38px; border: 1px solid #F2F4F7; }
.timg-none { width: 100%; height: 100%; display: grid; place-items: center; color: #C4CBD4; background: #F7F9FB; }
.timg-none .el-icon { font-size: 16px; }
/* 商城状态：圆点 + 文字，比 el-tag 更紧凑，不撑行高 */
.mstat { display: inline-flex; align-items: center; gap: 5px; font-size: 12px; color: #98A1AE; white-space: nowrap; }
.mstat::before { content: ''; width: 6px; height: 6px; border-radius: 50%; background: #CBD2DB; }
.mstat.on { color: #1E8E5A; }
.mstat.on::before { background: #1E8E5A; }
.tname { font-weight: 500; }
.tsub { font-size: 11.5px; color: #98A1AE; margin-top: 1px; }
.badge { font-size: 11px; padding: 1px 7px; border-radius: 4px; background: #EEF3FA; color: #1E3A5F; font-weight: 500; }
.badge-r { font-size: 11px; padding: 1px 7px; border-radius: 4px; background: #FDF0EE; color: #C0392B; font-weight: 500; }
.sub { font-size: 11.5px; color: #98A1AE; margin-left: 4px; }
.bcell { display: inline-flex; align-items: center; gap: 6px; }
.logo {
  width: 20px; height: 20px; border-radius: 5px; display: inline-grid; place-items: center;
  font-size: 11px; font-weight: 700; color: #fff; flex: 0 0 20px;
}
.logo.lg { width: 30px; height: 30px; border-radius: 8px; font-size: 14px; flex: 0 0 30px; }
.dim { color: #98A1AE; }
.price { color: #1E3A5F; }
.unit { font-size: 11.5px; color: #6B7280; margin-left: 1px; }
.brand-opt { display: flex; align-items: center; gap: 7px; }
.brand-opt .bn { flex: 1; }
.brand-opt .bc { font-size: 11px; color: #98A1AE; }

/* ---------- 品牌墙 ---------- */
.brandwall { display: grid; grid-template-columns: repeat(auto-fill, minmax(208px, 1fr)); gap: 13px; }
.bcard {
  background: #fff; border: 1px solid #E8EBF0; border-radius: 10px; padding: 15px;
  cursor: pointer; transition: all .18s; display: flex; flex-direction: column; gap: 12px;
}
.bcard:hover { border-color: #C3D4EC; box-shadow: 0 6px 18px rgba(30,58,95,.09); transform: translateY(-2px); }
.bcard.on { border-color: #2F6FEB; background: #FAFCFF; }
.bcard-top { display: flex; align-items: center; gap: 10px; }
.bcard-name { font-size: 14.5px; font-weight: 600; }
.bcard-sub { font-size: 11.5px; color: #98A1AE; margin-top: 1px; }
.bcard-foot {
  display: flex; align-items: center; font-size: 11.5px; color: #98A1AE;
  padding-top: 9px; border-top: 1px dashed #F2F4F7;
}
.bcard-foot b { color: #1E3A5F; font-size: 15px; margin-right: 3px; font-variant-numeric: tabular-nums; }
.bcard-foot .rt { margin-left: auto; }

/* ---------- 空态 / 分页 ---------- */
.empty { grid-column: 1 / -1; padding: 60px 0; text-align: center; color: #98A1AE; font-size: 13px; }
.empty .big { font-size: 32px; margin-bottom: 10px; opacity: .35; }
.empty .sug { margin-top: 12px; font-size: 12.5px; color: #5B6472; }
.empty .sug a { color: #2F6FEB; cursor: pointer; margin: 0 4px; }
.pager { display: flex; align-items: center; gap: 8px; margin-top: 16px; font-size: 13px; color: #5B6472; }
.pager .sp { margin-left: auto; }

/* ---------- 弹窗 ---------- */
.edit-form { padding: 4px 6px 0; }
.form-tip {
  margin: 4px 0 0 96px; padding: 8px 12px; background: #F7FAFF; border: 1px solid #E2ECFA;
  border-radius: 8px; font-size: 12.5px; color: #5B6472;
}
.form-tip b { color: #1E3A5F; font-size: 14px; }
.cover-box { display: flex; gap: 16px; align-items: flex-start; }
.cover-preview {
  width: 200px; height: 150px; border-radius: 8px; overflow: hidden;
  border: 1px solid #E8EBF0; position: relative; background: #F7F9FB; flex: 0 0 200px;
}
.cover-ops { display: flex; flex-direction: column; align-items: flex-start; gap: 8px; }

/* ---------- 抽屉 ---------- */
.dr-tip {
  font-size: 12.5px; color: #5B6472; background: #F7FAFF; border: 1px solid #E2ECFA;
  border-radius: 8px; padding: 10px 12px; line-height: 1.7; margin-bottom: 14px;
}
.dr-tip code { background: #fff; border: 1px solid #E2ECFA; border-radius: 3px; padding: 0 4px; color: #1E3A5F; }
.code-cell { font-size: 11.5px; color: #2F6FEB; background: #F2F7FF; padding: 1px 5px; border-radius: 3px; }
</style>
