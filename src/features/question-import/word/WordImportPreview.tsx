import { useRef, useState } from 'react'
import { optionLetters } from '../../../api'
import { errorText } from '../../../Modal'
import { ImageThumbnail } from '../../../QuestionImages'
import { maxImageBytes, readImage } from './images'
import type { WordDraft } from './questionParser'
import { draftError } from './wordDrafts'

export default function WordImportPreview({ draft, index, duplicate, canMerge, change, remove, merge, split, imageWork,
  imageTargets, moveImage, imageBudget }: {
  draft: WordDraft; index: number; duplicate?: string; canMerge: boolean
  change: (draft: WordDraft) => void; remove: () => void; merge: () => void; split: (offset: number) => void
  imageWork: (busy: boolean) => void
  imageTargets: number[]; moveImage: (image: number, question: number) => void
  imageBudget: { count: number; bytes: number }
}) {
  const text = useRef<HTMLTextAreaElement>(null)
  const upload = useRef<HTMLInputElement>(null)
  const [imageError, setImageError] = useState('')
  const [adding, setAdding] = useState(false)
  const [splitError, setSplitError] = useState('')
  const invalid = draftError(draft)
  const noContent = !draft.text.trim()
  const noAnswer = draft.kind === 'choice' ? !draft.correctOptions.length : !draft.answer.trim()
  const review = !!(draft.warnings.length || duplicate || (invalid && !noContent))
  const statuses = [
    noContent && 'Không đọc được nội dung',
    draft.imageError && 'Không đọc được ảnh',
    noAnswer && 'Không có đáp án',
    review && 'Cần kiểm tra',
  ].filter(Boolean)

  function reorder(from: number, to: number) {
    const images = [...draft.images]
    const [image] = images.splice(from, 1)
    images.splice(to, 0, image)
    change({ ...draft, images })
  }

  async function addImages(files: File[]) {
    if (!files.length) return
    setAdding(true)
    imageWork(true)
    setImageError('')
    const images = [...draft.images]
    const errors: string[] = []
    let { count, bytes } = imageBudget
    try {
      for (const file of files) {
        if (images.length >= 300 || count <= 0) { errors.push('Đã đạt giới hạn 300 ảnh.'); break }
        try {
          if (file.size > maxImageBytes) throw new Error('Ảnh vượt quá 5 MB.')
          if (file.size > bytes) throw new Error('Thêm ảnh này sẽ vượt tổng dung lượng 24 MB.')
          images.push(await readImage(new Uint8Array(await file.arrayBuffer()), file.name))
          count--
          bytes -= file.size
        } catch (cause) { errors.push(file.name + '. ' + errorText(cause)) }
      }
      change({ ...draft, images })
    } finally {
      setImageError(errors.join(' '))
      setAdding(false)
      imageWork(false)
    }
  }

  return <fieldset className="word-draft" disabled={adding}>
    <legend>Câu {index + 1}{draft.source !== undefined && draft.source !== index + 1 ? ` · Số gốc ${draft.source}` : ''}</legend>
    <p className={statuses.length ? 'word-warning' : 'muted'}>{statuses.length ? statuses.join(' · ') : 'Nhận diện đầy đủ'}</p>
    {!!(invalid || duplicate || draft.warnings.length) && <ul className="word-warnings">
      {[invalid, duplicate, ...draft.warnings].filter(Boolean).map((warning, i) => <li key={i}>{warning}</li>)}
    </ul>}
    <label>Nội dung câu hỏi<textarea ref={text} rows={3} value={draft.text} onChange={(event) => {
      setSplitError('')
      change({ ...draft, text: event.target.value })
    }}/></label>
    <div className="toolbar-actions">
      <button type="button" className="button secondary" onClick={() => {
        const offset = text.current?.selectionStart ?? 0
        if (!draft.text.slice(0, offset).trim() || !draft.text.slice(offset).trim()) {
          setSplitError('Đặt con trỏ giữa hai phần nội dung rồi bấm Tách tại con trỏ.')
          return
        }
        setSplitError('')
        split(offset)
      }}>Tách tại con trỏ</button>
      <button type="button" className="button secondary" disabled={!canMerge} onClick={merge}>Gộp với câu tiếp theo</button>
      <button type="button" className="button secondary" onClick={remove}>Xóa câu</button>
    </div>
    {splitError && <p className="word-warning" role="status">{splitError}</p>}
    <label>Loại câu hỏi<select value={draft.kind} onChange={(event) => {
      const kind = event.target.value === 'choice' ? 'choice' : 'open'
      change({ ...draft, kind, options: kind === 'choice' && !draft.options.length ? ['', '', '', ''] : draft.options })
    }}><option value="open">Tự luận</option><option value="choice">Trắc nghiệm</option></select></label>
    {draft.kind === 'choice' && <>
      <label>Số phương án<select value={draft.options.length} onChange={(event) => {
        const size = Number(event.target.value)
        change({ ...draft, options: Array.from({ length: size }, (_, i) => draft.options[i] ?? ''),
          correctOptions: draft.correctOptions.filter((index) => index < size) })
      }}>
        {draft.options.length < 2 && <option value={draft.options.length} disabled>Chọn số phương án</option>}
        {Array.from({ length: optionLetters.length - 1 }, (_, i) => <option key={i}>{i + 2}</option>)}
      </select></label>
      {draft.options.map((option, i) => <div className="option-editor-row" key={i}>
        <label>Phương án {optionLetters[i]}<textarea rows={1} value={option} onChange={(event) => {
          change({ ...draft, options: draft.options.map((value, j) => i === j ? event.target.value : value) })
        }}/></label>
        <label className="switch-row"><span>{optionLetters[i]} đúng</span><input type="checkbox" checked={draft.correctOptions.includes(i)} onChange={(event) => {
          change({ ...draft, correctOptions: event.target.checked ? [...draft.correctOptions, i] : draft.correctOptions.filter((value) => value !== i) })
        }}/></label>
      </div>)}
    </>}
    <label>{draft.kind === 'choice' ? 'Giải thích đáp án' : 'Đáp án'} (không bắt buộc)
      <textarea rows={2} value={draft.answer} onChange={(event) => change({ ...draft, answer: event.target.value })}/>
    </label>
    {!!draft.images.length && <div className="question-images" role="group" aria-label="Ảnh đính kèm">
      {draft.images.map((image, i) => <div className="word-image" key={image.id}>
        <ImageThumbnail blob={image.blob} name={image.name}/>
        <div className="word-image-actions">
          <button type="button" className="icon-button" disabled={!i} aria-label={`Chuyển ảnh ${i + 1} lên trước`} onClick={() => reorder(i, i - 1)}>←</button>
          <button type="button" className="icon-button" disabled={i === draft.images.length - 1} aria-label={`Chuyển ảnh ${i + 1} ra sau`} onClick={() => reorder(i, i + 1)}>→</button>
          <button type="button" className="text-button" aria-label={`Bỏ ảnh ${i + 1}`} onClick={() => change({ ...draft, images: draft.images.filter((_, j) => j !== i) })}>Bỏ</button>
        </div>
        {!!imageTargets.length && <select value="" aria-label={`Chuyển ảnh ${i + 1} sang câu khác`} onChange={(event) => moveImage(i, Number(event.target.value))}>
          <option value="" disabled>Chuyển ảnh…</option>
          {imageTargets.map((to) => <option value={to} key={to}>Sang câu {to + 1}</option>)}
        </select>}
      </div>)}
    </div>}
    <input type="file" hidden ref={upload} multiple accept=".png,.jpg,.jpeg" onChange={(event) => {
      const files = Array.from(event.currentTarget.files ?? [])
      event.currentTarget.value = ''
      void addImages(files)
    }}/>
    <button type="button" className="button secondary" onClick={() => upload.current?.click()}>{adding ? 'Đang đọc ảnh…' : 'Thêm ảnh PNG / JPEG'}</button>
    {imageError && <p className="word-warning" role="alert">{imageError}</p>}
  </fieldset>
}
