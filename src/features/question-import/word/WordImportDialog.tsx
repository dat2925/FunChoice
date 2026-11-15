import { useEffect, useMemo, useRef, useState } from 'react'
import { api, optionLetters, type QuestionPlan } from '../../../api'
import { errorText } from '../../../Modal'
import { maxDocxBytes } from './docxReader'
import { maxImageBatch } from './images'
import { createDraft, importWord, type WordDraft } from './questionParser'
import WordImportPreview from './WordImportPreview'
import { buildWordImport, draftError, duplicateWarnings } from './wordDrafts'

const pageSize = 8
const formatter = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 2 })

function mergeDrafts(left: WordDraft, right: WordDraft): WordDraft {
  const choice = left.kind === 'choice' ? left : right
  const bothChoice = left.kind === 'choice' && right.kind === 'choice'
  return {
    ...left,
    kind: choice.kind,
    options: choice.options,
    correctOptions: choice.correctOptions,
    text: [left.text, right.text, ...(bothChoice ? right.options.map((option, i) => optionLetters[i] + '. ' + option) : [])].filter(Boolean).join('\n'),
    answer: [left.answer, right.answer, bothChoice && right.correctOptions.length
      ? 'Đáp án câu gộp: ' + right.correctOptions.map((i) => optionLetters[i]).join(', ') : ''].filter(Boolean).join('\n'),
    images: [...left.images, ...right.images],
    imageError: left.imageError || right.imageError,
    warnings: [...new Set([...left.warnings, ...right.warnings, 'Đã gộp hai câu. Hãy kiểm tra lại nội dung và đáp án.'])],
  }
}

export default function WordImportDialog({ classroomId, plan, close, onSaved }: {
  classroomId: string; plan: QuestionPlan; close: () => void; onSaved: (plan: QuestionPlan, count: number) => void
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const file = useRef<HTMLInputElement>(null)
  const locked = useRef(false)
  const body = useRef<HTMLDivElement>(null)
  const [selected, setSelected] = useState<File>()
  const [drafts, setDrafts] = useState<WordDraft[]>()
  const [warnings, setWarnings] = useState<string[]>([])
  const [error, setError] = useState('')
  const [progress, setProgress] = useState('')
  const [dragging, setDragging] = useState(false)
  const [page, setPage] = useState(0)
  const duplicates = useMemo(() => drafts ? duplicateWarnings(drafts, plan.bank) : new Map<string, string>(), [drafts, plan.bank])
  const attachments = new Set(drafts?.flatMap((draft) => draft.images.map(({ blob }) => blob)))
  const attachmentBytes = [...attachments].reduce((total, blob) => total + blob.size, 0)
  const first = page * pageSize

  useEffect(() => {
    const element = dialog.current
    element?.showModal()
    return () => element?.close()
  }, [])

  async function load(files: FileList | null) {
    if (locked.current || !files?.length) return
    if (files.length !== 1) { setError('Hãy chọn một tệp Word mỗi lần.'); return }
    const chosen = files[0]
    setSelected(chosen)
    setDrafts(undefined)
    setWarnings([])
    setError('')
    setPage(0)
    if (/\.doc$/i.test(chosen.name)) { setError('Hãy mở tệp .doc trong Word và lưu lại dưới định dạng .docx.'); return }
    if (!/\.docx$/i.test(chosen.name)) { setError('Vui lòng chọn tệp Word có đuôi .docx.'); return }
    if (!chosen.size || chosen.size > maxDocxBytes) { setError('Tệp Word phải có dung lượng từ 1 byte đến 25 MB.'); return }
    locked.current = true
    setProgress('Đang mở tệp Word…')
    try {
      const result = await importWord(new Uint8Array(await chosen.arrayBuffer()), setProgress)
      setDrafts(result.drafts)
      setWarnings(result.warnings)
    } catch (cause) { setError(errorText(cause)) }
    finally { locked.current = false; setProgress('') }
  }

  function goToPage(next: number) {
    setPage(next)
    body.current?.scrollTo({ top: 0 })
  }

  async function save() {
    if (locked.current || !drafts?.length) return
    const invalid = drafts.findIndex(draftError)
    if (invalid >= 0) {
      goToPage(Math.floor(invalid / pageSize))
      setError(`Câu ${invalid + 1}. ${draftError(drafts[invalid])}`)
      return
    }
    locked.current = true
    setError('')
    setProgress('Đang lưu câu hỏi và ảnh vào ngân hàng của lớp…')
    try {
      const { questions, images } = await buildWordImport(drafts)
      const updated = await api.appendWordQuestions(classroomId, questions, images)
      onSaved(updated, questions.length)
    } catch (cause) { setError(errorText(cause)) }
    finally { locked.current = false; setProgress('') }
  }

  function edit(index: number, count: number, ...items: WordDraft[]) {
    setDrafts((previous) => {
      const next = [...(previous ?? [])]
      next.splice(index, count, ...items)
      return next
    })
    setError('')
  }

  function moveImage(question: number, attachment: number, target: number) {
    setDrafts((previous) => {
      if (!previous) return previous
      const next = [...previous]
      const from = next[question]
      const to = next[target]
      next[question] = { ...from, images: from.images.filter((_, index) => attachment !== index) }
      next[target] = { ...to, images: [...to.images, from.images[attachment]] }
      return next
    })
    setError('')
  }

  return <dialog ref={dialog} className="dialog word-dialog" aria-labelledby="word-import-title" onCancel={(event) => {
    event.preventDefault()
    if (!locked.current) close()
  }}>
    <div className="dialog-head"><h2 id="word-import-title">Nhập câu hỏi từ Word</h2>
      <button type="button" className="button secondary" onClick={close} disabled={!!progress}>Đóng</button>
    </div>
    <div className="word-dialog-body" ref={body}>
      <div className={'word-dropzone' + (dragging ? ' dragging' : '')} onDragOver={(event) => {
        event.preventDefault()
        if (!locked.current && event.dataTransfer.types.includes('Files')) setDragging(true)
      }} onDragLeave={() => setDragging(false)} onDrop={(event) => {
        event.preventDefault()
        setDragging(false)
        void load(event.dataTransfer.files)
      }}>
        <input type="file" hidden ref={file} accept=".docx,.doc" aria-label="Tệp Word" onChange={(event) => {
          void load(event.currentTarget.files)
          event.currentTarget.value = ''
        }}/>
        <p>Kéo thả tệp .docx vào đây (tối đa 25 MB)</p>
        <button type="button" className="button secondary" onClick={() => file.current?.click()} disabled={!!progress}>Chọn tệp Word</button>
        {selected && <p className="muted">{selected.name} · {formatter.format(selected.size / (selected.size < 1024 * 1024 ? 1024 : 1024 * 1024))} {selected.size < 1024 * 1024 ? 'KB' : 'MB'}</p>}
      </div>
      {!!warnings.length && <ul className="word-warnings" aria-label="Cảnh báo tài liệu">{warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>}
      {drafts && <fieldset className="word-preview" aria-label="Xem trước câu hỏi" disabled={!!progress}>
        <div className="word-preview-heading">
          <h3>Xem trước · {drafts.length} câu</h3>
          <button type="button" className="button secondary" disabled={drafts.length >= 500} onClick={() => {
            edit(drafts.length, 0, createDraft())
            goToPage(Math.floor(drafts.length / pageSize))
          }}>Thêm câu</button>
        </div>
        {duplicates.size > 0 && <p className="word-warning" role="status">{duplicates.size} câu có nội dung trùng hoặc gần trùng. Kiểm tra các cảnh báo trước khi lưu.</p>}
        {drafts.slice(first, first + pageSize).map((draft, position) => {
          const index = first + position
          const imageTargets = [index - 1, index + 1].filter((target) => drafts[target] && drafts[target].images.length < 300)
          return <WordImportPreview key={draft.id} draft={draft} index={index} duplicate={duplicates.get(draft.id)}
            imageTargets={imageTargets} moveImage={(image, to) => moveImage(index, image, to)}
            imageBudget={{ count: 300 - attachments.size, bytes: maxImageBatch - attachmentBytes }}
            imageWork={(busy) => { locked.current = busy; setProgress(busy ? 'Đang đọc ảnh đính kèm…' : '') }}
            canMerge={index + 1 < drafts.length} change={(value) => edit(index, 1, value)}
            remove={() => {
              edit(index, 1)
              if (index === first && index === drafts.length - 1 && page > 0) goToPage(page - 1)
            }} merge={() => edit(index, 2, mergeDrafts(draft, drafts[index + 1]))}
            split={(offset) => {
              if (drafts.length >= 500) { setError('Đã đạt giới hạn 500 câu mỗi lần nhập.'); return }
              const hint = 'Đã tách nội dung. Hãy kiểm tra lại phương án, đáp án và ảnh của hai câu.'
              const next = createDraft(draft.text.slice(offset).trim())
              next.warnings.push(hint)
              edit(index, 1, { ...draft, text: draft.text.slice(0, offset).trim(), warnings: [...new Set([...draft.warnings, hint])] }, next)
            }}/>
        })}
      </fieldset>}
    </div>
    {progress && <p className="word-dialog-status muted" role="status">{progress}</p>}
    {error && <p className="word-dialog-status alert" role="alert">{error}</p>}
    <div className="dialog-actions word-dialog-footer">
      {!!drafts && drafts.length > pageSize && <div className="toolbar-actions word-pagination">
        <button type="button" className="button secondary" disabled={!page || !!progress} onClick={() => goToPage(page - 1)}>Trang trước</button>
        <span>{page + 1} / {Math.ceil(drafts.length / pageSize)}</span>
        <button type="button" className="button secondary" disabled={first + pageSize >= drafts.length || !!progress} onClick={() => goToPage(page + 1)}>Trang sau</button>
      </div>}
      <button type="button" className="button primary" disabled={!drafts?.length || !!progress} onClick={() => void save()}>
        Lưu {drafts?.length || ''} câu vào ngân hàng
      </button>
    </div>
  </dialog>
}
