<template>
  <div class="contract-templates">
    <el-card>
      <template #header>
        <div class="card-header">
          <span>合同模板管理</span>
          <el-button type="primary" @click="openEditor(null)">新增模板</el-button>
        </div>
      </template>

      <el-tabs v-model="activeTab" @tab-change="loadData">
        <el-tab-pane label="系统模板" name="system" />
        <el-tab-pane label="个人模板" name="personal" />
      </el-tabs>

      <el-table :data="filteredTemplates" style="width:100%">
        <el-table-column prop="name" label="名称" />
        <el-table-column prop="category" label="分类">
          <template #default="{row}">{{ categoryMap[row.category] || row.category }}</template>
        </el-table-column>
        <el-table-column prop="content" label="变量" width="200">
          <template #default="{row}">
            <span v-if="row.template_fields" class="var-preview">
              {{ getVarLabels(row.template_fields) }}
            </span>
            <span v-else style="color:#999">无</span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="150">
          <template #default="{row}">
            <el-button size="small" type="primary" @click="openEditor(row)">编辑</el-button>
            <el-button size="small" type="danger" @click="handleDelete(row.id)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <!-- 编辑对话框 -->
    <el-dialog v-model="showDialog" :title="form.id ? '编辑模板' : '新增模板'" width="95%" top="2vh" destroy-on-close @opened="onDialogOpened">
      <div class="content-section">
        <!-- 顶部工具栏 -->
        <div class="editor-top-bar">
          <!-- 变量插入栏 -->
          <div class="var-insert">
            <div class="var-insert-top">
              <span class="section-label">固定变量：</span>
              <el-tag
                v-for="v in builtInVariables"
                :key="v.name"
                type="success"
                effect="plain"
                style="cursor:pointer;margin:2px;"
                @click="insertVar(v)"
              >{{ v.label }}：{{ '{' + v.name + '}' }}</el-tag>
            </div>
            <div class="var-list-row" v-if="customVariables.length > 0">
              <span class="section-label">自定义：</span>
              <el-tag
                v-for="cv in customVariables"
                :key="cv.name"
                type="warning"
                effect="plain"
                closable
                @close="removeCustomVar(cv)"
                style="cursor:pointer;margin:2px;"
                @click="insertVar(cv)"
              >{{ cv.label }}：{{ '{' + cv.name + '}' }}</el-tag>
            </div>
            <div class="var-list-row" v-if="computedVariables.length > 0">
              <span class="section-label">计算：</span>
              <el-tag
                v-for="cv in computedVariables"
                :key="cv.name"
                type="info"
                effect="plain"
                closable
                @close="removeComputedVar(cv)"
                style="cursor:pointer;margin:2px;"
                @click="insertComputedVar(cv)"
              >{{ cv.label }}：{={{ cv.name }}}</el-tag>
            </div>
            <div class="var-list-row">
              <el-button size="small" type="primary" plain icon="Plus" @click="openAddCustomVar">添加变量</el-button>
              <el-button size="small" type="info" plain icon="Plus" @click="openAddComputedVar">添加计算变量</el-button>
            </div>
          </div>

          <!-- 格式化工具栏 -->
          <div class="toolbar" v-if="editor">
            <el-button-group>
              <el-button size="small" :type="editor.isActive('bold') ? 'primary' : ''" @click="editor.chain().focus().toggleBold().run()"><b>B</b></el-button>
              <el-button size="small" :type="editor.isActive('italic') ? 'primary' : ''" @click="editor.chain().focus().toggleItalic().run()"><i>I</i></el-button>
              <el-button size="small" :type="editor.isActive('underline') ? 'primary' : ''" @click="editor.chain().focus().toggleUnderline().run()"><u>U</u></el-button>
              <el-button size="small" :type="editor.isActive('strike') ? 'primary' : ''" @click="editor.chain().focus().toggleStrike().run()"><s>S</s></el-button>
            </el-button-group>
            <el-button-group>
              <el-button size="small" :type="editor.isActive('heading', { level: 1 }) ? 'primary' : ''" @click="editor.chain().focus().toggleHeading({ level: 1 }).run()">H1</el-button>
              <el-button size="small" :type="editor.isActive('heading', { level: 2 }) ? 'primary' : ''" @click="editor.chain().focus().toggleHeading({ level: 2 }).run()">H2</el-button>
              <el-button size="small" :type="editor.isActive('heading', { level: 3 }) ? 'primary' : ''" @click="editor.chain().focus().toggleHeading({ level: 3 }).run()">H3</el-button>
            </el-button-group>
            <el-button-group>
              <el-button size="small" @click="editor.chain().focus().toggleBulletList().run()" :type="editor.isActive('bulletList') ? 'primary' : ''">•列表</el-button>
              <el-button size="small" @click="editor.chain().focus().toggleOrderedList().run()" :type="editor.isActive('orderedList') ? 'primary' : ''">1.列表</el-button>
            </el-button-group>
            <el-button-group>
              <el-button size="small" @click="editor.chain().focus().toggleBlockquote().run()" :type="editor.isActive('blockquote') ? 'primary' : ''">引用</el-button>
              <el-button size="small" @click="editor.chain().focus().toggleCode().run()" :type="editor.isActive('code') ? 'primary' : ''">代码</el-button>
              <el-button size="small" @click="editor.chain().focus().toggleCodeBlock().run()" :type="editor.isActive('codeBlock') ? 'primary' : ''">代码块</el-button>
            </el-button-group>
            <el-button-group>
              <el-button size="small" @click="openTableDialog" title="插入表格">表格</el-button>
              <el-button size="small" @click="toggleTableBorder" :disabled="!editor.isActive('table')" title="显示/隐藏边框">边框</el-button>
              <el-button size="small" @click="editor.chain().focus().toggleHighlight().run()" :type="editor.isActive('highlight') ? 'primary' : ''" title="荧光笔">荧光</el-button>
            </el-button-group>
            <el-button-group>
              <el-button size="small" title="文字颜色" @click="showColorPicker = !showColorPicker">
                <span style="border-bottom:2px solid">A</span>
              </el-button>
              <el-color-picker v-model="textColor" size="small" @change="(c) => { editor.chain().focus().setColor(c).run(); showColorPicker=false }" v-if="showColorPicker" />
              <el-button size="small" title="背景色" @click="showBgColorPicker = !showBgColorPicker">
                <span style="background:#ff0;padding:0 2px">A</span>
              </el-button>
              <el-color-picker v-model="bgColor" size="small" @change="(c) => { editor.chain().focus().setHighlight(c).run(); showBgColorPicker=false }" v-if="showBgColorPicker" />
            </el-button-group>
            <el-button-group>
              <el-button size="small" @click="editor.chain().focus().setTextAlign('left').run()">左</el-button>
              <el-button size="small" @click="editor.chain().focus().setTextAlign('center').run()">中</el-button>
              <el-button size="small" @click="editor.chain().focus().setTextAlign('right').run()">右</el-button>
            </el-button-group>
            <el-button-group>
              <el-button size="small" @click="editor.chain().focus().setHorizontalRule().run()" title="分隔线">—</el-button>
              <el-button size="small" @click="setLink" :type="editor.isActive('link') ? 'primary' : ''" title="链接">链接</el-button>
              <el-button size="small" @click="insertPageBreak" title="分页符">⏏</el-button>
            </el-button-group>
            <el-button-group>
              <el-button size="small" @click="editor.chain().focus().undo().run()" :disabled="!editor.can().undo()">撤销</el-button>
              <el-button size="small" @click="editor.chain().focus().redo().run()" :disabled="!editor.can().redo()">重做</el-button>
            </el-button-group>
          </div>
        </div>

        <!-- 编辑器 -->
        <div class="editor-container">
          <editor-content :editor="editor" class="editor-content" />
        </div>
      </div>

      <!-- 表单 -->
      <div class="form-row">
        <el-form :model="form" inline>
          <el-form-item label="名称"><el-input v-model="form.name" style="width:180px" /></el-form-item>
          <el-form-item label="分类">
            <el-select v-model="form.category" style="width:120px">
              <el-option label="装修合同" value="decoration" />
              <el-option label="设计合同" value="design" />
              <el-option label="其他" value="other" />
            </el-select>
          </el-form-item>
          <el-form-item label="类型">
            <el-select v-model="form.template_type" style="width:120px">
              <el-option label="系统模板" value="system" />
              <el-option label="个人模板" value="personal" />
            </el-select>
          </el-form-item>
        </el-form>
      </div>
      <template #footer>
        <el-button @click="showDialog = false">取消</el-button>
        <el-button type="primary" @click="handleSave">保存</el-button>
      </template>
    </el-dialog>

    <!-- 添加自定义变量 -->
    <el-dialog v-model="showAddCustomVarDialog" title="添加自定义变量" width="350px">
      <el-form :model="newCustomVar" label-width="80px">
        <el-form-item label="变量名">
          <el-input v-model="newCustomVar.label" placeholder="请输入变量名，如: 甲方姓名" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showAddCustomVarDialog = false">取消</el-button>
        <el-button type="primary" @click="addCustomVar">添加</el-button>
      </template>
    </el-dialog>

    <!-- 添加计算变量 -->
    <el-dialog v-model="showAddComputedVarDialog" title="添加计算变量" width="400px">
      <el-form :model="newComputedVar" label-width="80px">
        <el-form-item label="变量名">
          <el-input v-model="newComputedVar.label" placeholder="如: 金额大写" />
        </el-form-item>
        <el-form-item label="计算类型">
          <el-select v-model="newComputedVar.type" style="width:100%">
            <el-option label="大写金额" value="upper" />
            <el-option label="比例计算" value="ratio" />
          </el-select>
        </el-form-item>
        <el-form-item label="关联变量">
          <el-select v-model="newComputedVar.sourceVar" placeholder="请选择金额变量" style="width:100%">
            <el-option v-for="v in amountVars" :key="v.name" :label="v.label" :value="v.name" />
          </el-select>
        </el-form-item>
        <el-form-item v-if="newComputedVar.type === 'ratio'" label="比例(%)">
          <el-input v-model="newComputedVar.ratio" placeholder="如: 5 表示 5%" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showAddComputedVarDialog=false">取消</el-button>
        <el-button type="primary" @click="addComputedVar">添加</el-button>
      </template>
    </el-dialog>

    <!-- 编辑计算变量 -->
    <el-dialog v-model="showEditComputedVarDialog" title="编辑计算变量" width="400px">
      <el-form :model="editingComputedVar" label-width="80px">
        <el-form-item label="变量名">
          <el-input v-model="editingComputedVar.label" placeholder="如: 金额大写" />
        </el-form-item>
        <el-form-item label="计算类型">
          <el-select v-model="editingComputedVar.type" style="width:100%">
            <el-option label="大写金额" value="upper" />
            <el-option label="比例计算" value="ratio" />
          </el-select>
        </el-form-item>
        <el-form-item label="关联变量">
          <el-select v-model="editingComputedVar.sourceVar" placeholder="请选择金额变量" style="width:100%">
            <el-option v-for="v in amountVars" :key="v.name" :label="v.label" :value="v.name" />
          </el-select>
        </el-form-item>
        <el-form-item v-if="editingComputedVar.type === 'ratio'" label="比例(%)">
          <el-input v-model="editingComputedVar.ratio" placeholder="如: 5 表示 5%" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showEditComputedVarDialog=false">取消</el-button>
        <el-button type="primary" @click="saveComputedVar">保存</el-button>
      </template>
    </el-dialog>

  <!-- 插入表格 -->
  <el-dialog v-model="showInsertTableDialog" title="插入表格" width="350px">
    <el-form :model="tableForm" label-width="80px">
      <el-form-item label="行数">
        <el-input-number v-model="tableForm.rows" :min="1" :max="20" style="width:100%" />
      </el-form-item>
      <el-form-item label="列数">
        <el-input-number v-model="tableForm.cols" :min="1" :max="10" style="width:100%" />
      </el-form-item>
      <el-form-item label="含表头行">
        <el-switch v-model="tableForm.withHeaderRow" />
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="showInsertTableDialog=false">取消</el-button>
      <el-button type="primary" @click="doInsertTable">插入</el-button>
    </template>
  </el-dialog>

  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, nextTick } from 'vue'
import axios from 'axios'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useEditor, EditorContent, Extension } from '@tiptap/vue-3'
import { Plugin } from 'prosemirror-state'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import TextAlign from '@tiptap/extension-text-align'
import Placeholder from '@tiptap/extension-placeholder'
import Highlight from '@tiptap/extension-highlight'
import { TextStyle } from '@tiptap/extension-text-style'
import Typography from '@tiptap/extension-typography'
import { Link } from '@tiptap/extension-link'
import { Table } from '@tiptap/extension-table'
import { TableRow } from '@tiptap/extension-table-row'
import { TableCell } from '@tiptap/extension-table-cell'
import { numberToCurrency } from 'chinese-number-format'
import { TableHeader } from '@tiptap/extension-table-header'

// ============ 对话框状态 ============
const showDialog = ref(false)
const showAddCustomVarDialog = ref(false)
const newCustomVar = reactive({ name: '', label: '' })

// ============ 颜色选择器 ============
const showInsertTableDialog = ref(false)
const tableForm = reactive({ rows: 3, cols: 3, withHeaderRow: true })

const openTableDialog = () => {
  tableForm.rows = 3
  tableForm.cols = 3
  tableForm.withHeaderRow = true
  showInsertTableDialog.value = true
}

const doInsertTable = () => {
  editor.value?.chain().focus().insertTable({ rows: tableForm.rows, cols: tableForm.cols, withHeaderRow: tableForm.withHeaderRow }).run()
  showInsertTableDialog.value = false
}

// 判断当前表格是否隐藏了边框
const isTableBorderHidden = () => {
  if (!editor.value?.isActive('table')) return false
  let depth = editor.value.state.selection.$anchor.depth
  while (depth > 0 && editor.value.state.selection.$anchor.node(depth)?.type.name !== 'table') {
    depth--
  }
  const table = depth > 0 ? editor.value.state.selection.$anchor.node(depth) : null
  if (!table) return false
  let hidden = true
  table.descendants((cell) => {
    if (cell.type.name === 'tableCell' || cell.type.name === 'tableHeader') {
      if (cell.attrs.borderColor !== '#ffffff') hidden = false
    }
  })
  return hidden
}

// 切换表格边框显示/隐藏
const toggleTableBorder = () => {
  if (!editor.value?.isActive('table')) return
  // 向上找到 table 节点深度
  let depth = editor.value.state.selection.$anchor.depth
  while (depth > 0 && editor.value.state.selection.$anchor.node(depth)?.type.name !== 'table') {
    depth--
  }
  if (depth === 0) return
  const table = editor.value.state.selection.$anchor.node(depth)

  // 判断当前状态
  let currentlyShowing = false
  table.descendants((cell) => {
    if (cell.type.name === 'tableCell' || cell.type.name === 'tableHeader') {
      if (cell.attrs.borderColor !== '#ffffff') currentlyShowing = true
    }
  })

  const newBorderColor = currentlyShowing ? '#ffffff' : '#000000'
  const tablePos = editor.value.state.selection.$anchor.pos
  const resolvedPos = editor.value.state.doc.resolve(tablePos)
  const tableStart = resolvedPos.start(depth)

  let transaction = editor.value.state.tr
  table.descendants((cell, cellPos) => {
    if (cell.type.name === 'tableCell' || cell.type.name === 'tableHeader') {
      const absPos = tableStart + cellPos
      transaction = transaction.setNodeMarkup(absPos, null, { ...cell.attrs, borderColor: newBorderColor })
    }
  })
  editor.value.view.dispatch(transaction)
}

const showColorPicker = ref(false)
const showBgColorPicker = ref(false)
const textColor = ref('#000000')
const bgColor = ref('#ffff00')

// ============ 内置变量（固定变量，不可删除） ============
const builtInVariables = [
  { name: 'contract_no', label: '合同编号' },
  { name: 'customer_name', label: '客户姓名' },
  { name: 'customer_phone', label: '客户电话' },
  { name: 'id_card', label: '身份证号' },
  { name: 'engineering_address', label: '施工地址' },
  { name: 'project_name', label: '项目名称' },
  { name: 'total_amount', label: '合同金额' },
  { name: 'sign_date', label: '签订日期' },
  { name: 'start_date', label: '开工日期' },
  { name: 'end_date', label: '竣工日期' },
]

// ============ 自定义变量 ============
const customVariables = ref([])

// ============ 计算变量 ============
const computedVariables = ref([]) // [{name, label, type, sourceVar, ratio}]
const showAddComputedVarDialog = ref(false)
const newComputedVar = reactive({ name: '', label: '', type: 'upper', sourceVar: '', ratio: '' })
const showEditComputedVarDialog = ref(false)
const editingComputedVar = reactive({ name: '', label: '', type: 'upper', sourceVar: '', ratio: '' })

// 可用于计算的所有金额类变量（内置 + 自定义）
const amountVars = computed(() => [...builtInVariables, ...customVariables.value])

const openAddCustomVar = () => {
  newCustomVar.name = ''
  newCustomVar.label = ''
  showAddCustomVarDialog.value = true
}

const addCustomVar = () => {
  if (!newCustomVar.label) return ElMessage.warning('请填写变量名')
  // 自动生成 name：从显示名转换
  const generatedName = newCustomVar.label
    .replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, '_')
    .replace(/([A-Z])/g, '_$1')
    .toLowerCase()
    .replace(/\u4e00-\u9fa5/g, (ch) => ch.charCodeAt(0).toString(16))
    .replace(/_0x/g, '_')
  if (customVariables.value.some(v => v.name === generatedName)) return ElMessage.warning('变量名已存在')
  if (customVariables.value.some(v => v.label === newCustomVar.label)) return ElMessage.warning('变量名已存在')
  if (builtInVariables.some(bv => bv.label === newCustomVar.label)) return ElMessage.warning('变量名与内置变量重复')
  customVariables.value.push({ name: generatedName, label: newCustomVar.label })
  newCustomVar.name = ''
  newCustomVar.label = ''
  showAddCustomVarDialog.value = false
  ElMessage.success('添加成功')
}

// 获取计算变量的值（预览用）
const getComputedVarValue = (cv) => {
  return cv.label + '（{=' + cv.name + '}）'
}

// 数字转中文大写金额
const toChineseMoney = (num) => {
  if (isNaN(num) || num === null || num === undefined) return ''
  return numberToCurrency(num, { locale: 'zh-CN' })
}

// 打开添加计算变量弹窗
const openAddComputedVar = () => {
  newComputedVar.label = ''
  newComputedVar.type = 'upper'
  newComputedVar.sourceVar = ''
  newComputedVar.ratio = ''
  showAddComputedVarDialog.value = true
}

// 添加计算变量
const addComputedVar = () => {
  if (!newComputedVar.label) return ElMessage.warning('请填写变量名')
  if (!newComputedVar.sourceVar) return ElMessage.warning('请选择关联变量')
  if (!newComputedVar.ratio && newComputedVar.type === 'ratio') return ElMessage.warning('请填写比例')
  const generatedName = newComputedVar.label
    .replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, '_')
    .replace(/([A-Z])/g, '_$1')
    .toLowerCase()
    .replace(/\u4e00-\u9fa5/g, (ch) => ch.charCodeAt(0).toString(16))
    .replace(/_0x/g, '_')
  if (computedVariables.value.some(v => v.name === generatedName)) return ElMessage.warning('变量名已存在')
  computedVariables.value.push({ name: generatedName, label: newComputedVar.label, type: newComputedVar.type, sourceVar: newComputedVar.sourceVar, ratio: newComputedVar.ratio })
  newComputedVar.label = ''
  newComputedVar.type = 'upper'
  newComputedVar.sourceVar = ''
  newComputedVar.ratio = ''
  showAddComputedVarDialog.value = false
  ElMessage.success('添加成功')
}

// 删除计算变量
const removeComputedVar = (cv) => {
  const idx = computedVariables.value.findIndex(v => v.name === cv.name)
  if (idx >= 0) computedVariables.value.splice(idx, 1)
}

// 点击计算变量：插入占位符到编辑器
const insertComputedVar = (cv) => {
  if (!editor.value) { ElMessage.warning('编辑器未就绪'); return }
  editor.value.chain().focus().insertContent('{=' + cv.name + '}').run()
}

// 保存计算变量编辑
const saveComputedVar = () => {
  const idx = computedVariables.value.findIndex(v => v.name === editingComputedVar.name)
  if (idx >= 0) {
    computedVariables.value[idx] = { ...editingComputedVar }
  }
  showEditComputedVarDialog.value = false
  ElMessage.success('保存成功')
}

// 点击计算变量标签（编辑模式打开编辑弹窗）
const handleComputedVarClick = (cv) => {
  Object.keys(editingComputedVar).forEach(k => { editingComputedVar[k] = cv[k] })
  showEditComputedVarDialog.value = true
}

const removeCustomVar = (varItem) => {
  const idx = customVariables.value.findIndex(v => v.name === varItem.name)
  if (idx >= 0) customVariables.value.splice(idx, 1)
  ElMessage.success('已删除')
}

// ============ Word 表格粘贴扩展 ============
const WordTablePasteExtension = Extension.create({
  name: 'wordTablePaste',
  addProseMirrorPlugins() {
    return [
      new Plugin({
        props: {
          handlePaste(view, event) {
            const clipboardData = event.clipboardData || window.clipboardData
            if (!clipboardData) return false
            const html = clipboardData.getData('text/html')
            if (!html) return false
            const clean = cleanPasteHTML(html)
            const parser = new DOMParser()
            const doc = parser.parseFromString(clean, 'text/html')
            const body = doc.body
            const hasTable = body.querySelector('table') !== null
            if (hasTable) {
              view.editor.chain().focus().insertContent(clean).run()
              return true
            }
            return false
          }
        }
      })
    ]
  }
})

const cleanPasteHTML = (html) => {
  return html
    .replace(/<\/?o:[^>]+>/gi, '')
    .replace(/<\/?w:[^>]+>/gi, '')
    .replace(/<\/?m:[^>]+>/gi, '')
    .replace(/<\/?v:[^>]+>/gi, '')
    .replace(/class="Mso[^"]*"/gi, '')
    .replace(/style="Mso[^"]*"/gi, '')
    .replace(/<xml[\s\S]*?<\/xml>/gi, '')
    .replace(/<o:SmartTag[\s\S]*?<\/o:SmartTag>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/on\w+="[^"]*"/gi, '')
    .replace(/on\w+='[^']*'/gi, '')
    .replace(/javascript:/gi, '')
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, '')
    .replace(/<object[\s\S]*?<\/object>/gi, '')
    .replace(/<embed[\s\S]*?>/gi, '')
    .replace(/<form[\s\S]*?<\/form>/gi, '')
    .replace(/<input[\s\S]*?>/gi, '')
    .replace(/<button[\s\S]*?<\/button>/gi, '')
    .replace(/<select[\s\S]*?<\/select>/gi, '')
    .replace(/<textarea[\s\S]*?<\/textarea>/gi, '')
}

// ============ Tiptap 编辑器 ============
const editor = useEditor({
  extensions: [
    StarterKit,
    Underline,
    TextAlign.configure({ types: ['heading', 'paragraph'] }),
    Highlight.configure({ multicolor: true }),
    TextStyle,
    Typography,
    Link,
    Table.configure({ resizable: true }),
    TableRow,
    TableCell.extend({
      addAttributes() {
        return {
          ...this.parent?.(),
          borderColor: { default: '#000000', parseHTML: (el) => el.style.borderColor || '#000000', renderHTML: (attrs) => ({ style: `border: 1px solid ${attrs.borderColor}` }) },
        }
      },
    }),
    TableHeader.extend({
      addAttributes() {
        return {
          ...this.parent?.(),
          borderColor: { default: '#000000', parseHTML: (el) => el.style.borderColor || '#000000', renderHTML: (attrs) => ({ style: `border: 1px solid ${attrs.borderColor}` }) },
        }
      },
    }),
    Placeholder.configure({ placeholder: '在此输入合同内容，使用上方变量按钮插入 {变量名} 占位符...' }),
    WordTablePasteExtension,
  ],
  content: '',
  onUpdate: ({ editor }) => {
    form.content = editor.getHTML()
  },
})

// ============ 工具栏动作 ============
const setLink = () => {
  const url = prompt('输入链接地址:')
  if (url) {
    editor.value.chain().focus().setLink({ href: url }).run()
  } else {
    editor.value.chain().focus().unsetLink().run()
  }
}

const insertPageBreak = () => {
  editor.value.chain().focus().setHardBreak().run()
  editor.value.chain().focus().insertContent('<hr style="page-break-after:always;border:none;border-top:1px dashed #ccc;margin:20px 0;" />').run()
}

// ============ 插入变量（插入占位符 {name}，不代入值） ============
const insertVar = (v) => {
  if (!editor.value) { ElMessage.warning('编辑器未就绪'); return }
  editor.value.chain().focus().insertContent('{' + v.name + '}').run()
}

// ============ 对话框打开/关闭 ============
const onDialogOpened = () => {
  editor.value?.commands.setContent(form.content || '<p></p>')
  nextTick(() => { editor.value?.commands.focus() })
}

// ============ 模板列表 ============
const templateList = ref([])
const activeTab = ref('system')
const form = reactive({
  id: null, name: '', category: 'decoration', content: '', template_type: 'personal'
})
const filteredTemplates = computed(() => templateList.value.filter(t => t.template_type === activeTab.value))

const categoryMap = {
  decoration: '装修合同',
  design: '设计合同',
  other: '其他'
}

const getVarLabels = (templateFieldsRaw) => {
  try {
    const fields = typeof templateFieldsRaw === 'string' ? JSON.parse(templateFieldsRaw) : templateFieldsRaw
    if (!fields) return ''
    const labels = []
    if (fields.vars && Array.isArray(fields.vars)) {
      fields.vars.forEach(f => labels.push(f.label))
    } else if (Array.isArray(fields)) {
      fields.forEach(f => labels.push(f.label))
    }
    if (fields.computed && Array.isArray(fields.computed)) {
      fields.computed.forEach(f => labels.push(f.label + '(算)'))
    }
    return labels.join('、')
  } catch { return '' }
}

// ============ 加载/保存/删除 ============
const loadData = async () => {
  try {
    const user = JSON.parse(localStorage.getItem('user') || '{}')
    const res = await axios.get('/api/contract-templates', {
      headers: {
        'x-user-id': user.id || 0,
        'x-user-role': user.role_code || user.role_name || ''
      }
    })
    templateList.value = res.data || []
  } catch (e) { console.error(e) }
}

const openEditor = (row) => {
  if (row) {
    Object.assign(form, { ...row })
    // 加载模板的自定义变量和计算变量
    customVariables.value = []
    computedVariables.value = []
    if (row.template_fields) {
      try {
        const fields = typeof row.template_fields === 'string' ? JSON.parse(row.template_fields) : row.template_fields
        // 新格式: { vars: [], computed: [] }
        if (fields.vars && Array.isArray(fields.vars)) {
          customVariables.value = fields.vars.map(f => ({ name: f.name, label: f.label }))
        } else if (Array.isArray(fields)) {
          // 旧格式: 直接是数组
          customVariables.value = fields.map(f => ({ name: f.name, label: f.label }))
        }
        if (fields.computed && Array.isArray(fields.computed)) {
          computedVariables.value = fields.computed.map(f => ({ name: f.name, label: f.label, type: f.type, sourceVar: f.sourceVar, ratio: f.ratio }))
        }
      } catch (e) { console.error('解析template_fields失败', e) }
    }
  } else {
    Object.keys(form).forEach(k => { form[k] = k === 'category' ? 'decoration' : k === 'template_type' ? 'personal' : '' })
    form.id = null
    customVariables.value = []
    computedVariables.value = []
  }
  showDialog.value = true
}

const handleSave = async () => {
  if (!form.name) return ElMessage.warning('请输入名称')
  if (editor.value) form.content = editor.value.getHTML()

  try {
    const user = JSON.parse(localStorage.getItem('user') || '{}')
    const headers = { 'x-user-id': user.id || 0, 'x-user-role': user.role_code || user.role_name || '' }
    const varsToSave = customVariables.value.map(v => ({ name: v.name, label: v.label }))
    const computedToSave = computedVariables.value.map(cv => ({ name: cv.name, label: cv.label, type: cv.type, sourceVar: cv.sourceVar, ratio: cv.ratio }))
    const payload = {
      ...form,
      template_fields: JSON.stringify({ vars: varsToSave, computed: computedToSave }),
      user_id: user.id || 0
    }
    if (form.id) {
      await axios.put(`/api/contract-templates/${form.id}`, payload, { headers })
    } else {
      await axios.post('/api/contract-templates', payload, { headers })
    }
    ElMessage.success('保存成功')
    showDialog.value = false
    loadData()
  } catch (e) {
    ElMessage.error(e?.response?.data?.message || '保存失败')
  }
}

const handleDelete = async (id) => {
  try {
    await ElMessageBox.confirm('确定删除?', '提示', { type: 'warning' })
    const user = JSON.parse(localStorage.getItem('user') || '{}')
    await axios.delete(`/api/contract-templates/${id}`, { headers: { 'x-user-id': user.id || 0 } })
    ElMessage.success('删除成功')
    loadData()
  } catch (e) {
    if (e !== 'cancel') ElMessage.error(e?.response?.data?.message || '删除失败')
  }
}

onMounted(() => { loadData() })
</script>

<style scoped>
.card-header { display:flex; justify-content:space-between; }

.content-section {
  height: 75vh;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.editor-top-bar {
  position: sticky;
  top: 0;
  z-index: 20;
  background: linear-gradient(180deg, #ffffff 0%, #f8f9fc 100%);
  padding: 12px 16px 10px;
  border-bottom: 1px solid #e8ecf4;
  border-radius: 8px 8px 0 0;
}

.var-insert {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 10px;
  padding-bottom: 10px;
  border-bottom: 1px dashed #e4e8f0;
}

.var-insert-top, .var-list-row {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  align-items: center;
}

.section-label {
  font-size: 13px;
  color: #606266;
  font-weight: 500;
  margin-right: 4px;
  min-width: 52px;
}

.var-insert :deep(.el-tag) {
  border-radius: 16px;
  transition: all 0.2s;
  font-size: 12px;
}

.var-insert :deep(.el-tag:hover) {
  background: #f0f9eb;
  border-color: #67c23a;
  color: #67c23a;
}

.toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  padding: 8px;
  background: #fafafa;
  border: 1px solid #dcdfe6;
  border-radius: 6px;
}

.toolbar :deep(.el-button-group .el-button) {
  border-radius: 6px;
  font-size: 13px;
  transition: all 0.2s;
}

.editor-container {
  overflow-y: auto;
  flex: 1;
  background: #fff;
  border: 1px solid #dcdfe6;
  border-top: none;
  border-radius: 0 0 8px 8px;
  padding: 16px;
}

.editor-content {
  width: 100%;
  min-height: 60vh;
}

.editor-content :deep(.tiptap) {
  outline: none;
  font-family: SimSun, Microsoft YaHei, serif;
  font-size: 12pt;
  line-height: 1.8;
  min-height: 60vh;
  cursor: text;
  white-space: pre-wrap;
}

.editor-content :deep(.tiptap p) {
  margin: 0.3em 0;
  text-indent: 0;
}

.editor-content :deep(.tiptap h1) {
  font-size: 18pt;
  font-weight: bold;
  text-align: center;
  margin: 0.8em 0 0.4em;
  text-indent: 0;
}

.editor-content :deep(.tiptap h2) {
  font-size: 15pt;
  font-weight: bold;
  margin: 0.6em 0 0.3em;
  text-indent: 0;
}

.editor-content :deep(.tiptap h3) {
  font-size: 13pt;
  font-weight: bold;
  margin: 0.5em 0 0.2em;
  text-indent: 0;
}

:deep(.tiptap blockquote) {
  border-left: 3px solid #409eff;
  padding-left: 1em;
  margin: 0.8em 0;
  color: #666;
}

:deep(.tiptap table) {
  border-collapse: collapse;
  width: 100%;
  margin: 0.5em 0;
  display: table !important;
}

:deep(.tiptap td),
:deep(.tiptap th) {
  padding: 4px 8px;
  font-size: 11pt;
  min-width: 50px;
}

:deep(.tiptap th) {
  background: #f5f5f5;
  font-weight: bold;
}

:deep(.tiptap table p) {
  margin: 0;
  text-indent: 0;
}

:deep(.tiptap code) {
  background: #f0f0f0;
  padding: 0.2em 0.4em;
  border-radius: 3px;
}

:deep(.tiptap pre) {
  background: #1e1e1e;
  color: #d4d4d4;
  padding: 1em;
  border-radius: 4px;
  overflow-x: auto;
}

:deep(.tiptap ul),
:deep(.tiptap ol) {
  padding-left: 1.5em;
  margin: 0.3em 0;
}

:deep(.tiptap li) {
  margin: 0.2em 0;
}

:deep(.tiptap hr) {
  page-break-after: always;
  border: none;
  border-top: 2px dashed #409eff;
  margin: 20px 0;
}

:deep(.tiptap mark) {
  background: #ffff00;
  padding: 0.1em 0.2em;
}

:deep(.tiptap a) {
  color: #409eff;
  text-decoration: underline;
}

:deep(.ProseMirror) {
  outline: none;
  min-height: 60vh;
}

:deep(.ProseMirror p.is-editor-empty:first-child::before) {
  content: attr(data-placeholder);
  color: #aaa;
  font-style: italic;
  pointer-events: none;
  float: left;
  height: 0;
}

.form-row {
  padding: 10px 0;
  border-top: 1px solid #dcdfe6;
}

.var-preview {
  font-size: 12px;
  color: #67c23a;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  display: block;
  max-width: 200px;
}

:deep(.el-dialog__footer) {
  position: sticky;
  bottom: 0;
  background: linear-gradient(180deg, #f8f9fc 0%, #ffffff 100%);
  padding: 15px 20px;
  border-top: 1px solid #e4e8f0;
  box-shadow: 0 -2px 8px rgba(0,0,0,0.06);
  z-index: 10;
}

:deep(.tiptap td),
:deep(.tiptap th) {
  padding: 4px 8px;
  font-size: 11pt;
}

:deep(.tiptap td.no-border),
:deep(.tiptap th.no-border) {
  border: none !important;
}
</style>
