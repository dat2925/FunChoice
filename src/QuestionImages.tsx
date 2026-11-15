import { useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { api } from './api'
import { imageMime } from './features/question-import/word/images'

function ImageViewer({ url, name, close }: { url: string; name: string; close: () => void }) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const dialog = ref.current
    dialog?.showModal()
    return () => dialog?.close()
  }, [])
  return <dialog className="dialog question-image-viewer" aria-label={name} ref={ref} onCancel={(event) => {
    event.stopPropagation()
    event.preventDefault()
    close()
  }}>
    <div className="dialog-head"><h2>{name}</h2><button type="button" className="button secondary" onClick={close}>Đóng ảnh</button></div>
    <img src={url} alt={name}/>
  </dialog>
}

export function ImageThumbnail({ blob, name }: { blob: Blob; name: string }) {
  const [url, setUrl] = useState('')
  const [enlarged, setEnlarged] = useState(false)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    const objectUrl = URL.createObjectURL(blob)
    setUrl(objectUrl)
    setFailed(false)
    return () => URL.revokeObjectURL(objectUrl)
  }, [blob])
  if (failed) return <span className="word-warning" role="status">Không đọc được ảnh {name}.</span>
  if (!url) return null
  return <>
    <button className="question-image-thumbnail" type="button" aria-label={'Xem ảnh ' + name} onClick={() => setEnlarged(true)}>
      <img src={url} alt={name} loading="lazy" decoding="async" onError={() => setFailed(true)}/>
    </button>
    {enlarged && <ImageViewer url={url} name={name} close={() => setEnlarged(false)}/>}
  </>
}

function SavedImage({ id, name }: { id: string; name: string }) {
  const [image, setImage] = useState<Blob | 'error'>()
  useEffect(() => {
    let active = true
    void api.questionImage(id).then((data) => {
      const mime = imageMime(new Uint8Array(data))
      if (active) setImage(mime ? new Blob([data], { type: mime }) : 'error')
    }).catch(() => { if (active) setImage('error') })
    return () => { active = false }
  }, [id])
  if (image === 'error') return <span className="word-warning" role="status">Không đọc được {name.toLowerCase()}.</span>
  return image ? <ImageThumbnail blob={image} name={name}/> : <span role="status">Đang tải {name.toLowerCase()}…</span>
}

export default function QuestionImages({ imageIds, presentation = false }: { imageIds?: string[]; presentation?: boolean }) {
  const [index, setIndex] = useState(0)
  if (!imageIds?.length) return null
  if (presentation) {
    const current = Math.min(index, imageIds.length - 1)
    const name = 'Ảnh ' + (current + 1)
    return <div className="question-images question-images-presented" role="group" aria-label="Ảnh đính kèm">
      <div className="question-image-frame">
        <SavedImage key={imageIds[current] + ':' + current} id={imageIds[current]} name={name}/>
      </div>
      {imageIds.length > 1 && <div className="question-image-navigation">
        <button type="button" className="button secondary" aria-label="Ảnh trước" disabled={!current} onClick={() => setIndex(current - 1)}><ChevronLeft size={22} aria-hidden="true"/></button>
        <span aria-live="polite">{name} / {imageIds.length}</span>
        <button type="button" className="button secondary" aria-label="Ảnh tiếp theo" disabled={current === imageIds.length - 1} onClick={() => setIndex(current + 1)}><ChevronRight size={22} aria-hidden="true"/></button>
      </div>}
    </div>
  }
  return <div className="question-images" role="group" aria-label="Ảnh đính kèm">
    {imageIds.map((id, index) => <SavedImage key={id + ':' + index} id={id} name={'Ảnh ' + (index + 1)}/>)}
  </div>
}
