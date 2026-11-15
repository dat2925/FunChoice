// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { Blob as NodeBlob } from 'node:buffer'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { importWord, parseQuestions } from '../src/features/question-import/word/questionParser'
import { buildWordImport, duplicateWarnings } from '../src/features/question-import/word/wordDrafts'

function readFixture(name: string) {
  return new Uint8Array(readFileSync(`tests/fixtures/word/${name}.docx`))
}

afterEach(() => vi.unstubAllGlobals())

describe('nhập câu hỏi Word', () => {
  it('nhận diện trắc nghiệm A–D, A–H, nhiều dòng và tự luận có hoặc thiếu đáp án', async () => {
    const { drafts, warnings } = await importWord(readFixture('cau-hoi'), vi.fn())
    expect(warnings).toEqual([])
    expect(drafts).toHaveLength(4)
    expect(drafts[0]).toMatchObject({ text: 'Thủ đô của Việt Nam là gì?', options: ['Hà Nội', 'Đà Nẵng', 'Huế', 'Hải Phòng'], correctOptions: [0] })
    expect(drafts[1]).toMatchObject({ options: ['1', '2', '3', '5', '7', '9', '11', '12'], correctOptions: [1, 7] })
    expect(drafts[2]).toMatchObject({
      kind: 'open', text: 'Hãy giải thích hiện tượng quang hợp.\nNêu một ví dụ về vai trò của ánh sáng.',
      answer: 'Quang hợp là quá trình cây tạo chất hữu cơ.\nÁnh sáng cung cấp năng lượng.',
    })
    expect(drafts[3]).toMatchObject({ kind: 'open', answer: '', options: [], correctOptions: [] })
  })

  it('đọc các phương án trong bảng và đáp án dạng dòng hoặc bảng ở cuối', async () => {
    const { drafts, warnings } = await importWord(readFixture('bang-dap-an'), vi.fn())
    expect(warnings).toEqual([])
    expect(drafts.map((draft) => draft.correctOptions)).toEqual([[1], [2], [0]])
    expect(drafts.map((draft) => draft.options)).toEqual([
      ['3', '4', '5', '6'], ['10', '20', '25', '30'], ['5', '10', '15', '20'],
    ])
  })

  it('ghép ảnh PNG và JPEG, đánh dấu vị trí mơ hồ, cảnh báo ảnh hỏng, liên kết ngoài và OMML', async () => {
    const decode = vi.fn(async () => ({ close: vi.fn() }))
    vi.stubGlobal('createImageBitmap', decode)
    // Node provides Blob.arrayBuffer for the storage payload, which jsdom does not implement.
    vi.stubGlobal('Blob', NodeBlob)
    const { drafts, warnings } = await importWord(readFixture('hinh-anh'), vi.fn())
    expect(warnings).toEqual([])
    expect(drafts.map((draft) => draft.images.map(({ blob }) => blob.type))).toEqual([
      ['image/png'], ['image/jpeg', 'image/png'], [], [],
    ])
    expect(decode).toHaveBeenCalledTimes(2)
    expect(drafts[1].warnings).toContain('Ảnh nằm giữa hai câu hỏi. Hãy kiểm tra ảnh thuộc câu nào.')
    expect(drafts[2].text).toBe('Tính giá trị của [Công thức]')
    expect(drafts[2].warnings).toContain('Công thức cần kiểm tra thủ công')
    expect(drafts[3].imageError).toBe(true)
    expect(drafts[3].warnings.join(' ')).toMatch(/Không đọc được ảnh.*liên kết ngoài/)
    const payload = await buildWordImport(drafts)
    expect(payload.questions.map(({ images }) => images)).toEqual([[0], [1, 0], [], []])
    expect(payload.images).toHaveLength(2)
  })

  it('cảnh báo đáp án mâu thuẫn và các câu giống câu có sẵn', () => {
    const { drafts } = parseQuestions(['Câu 1: Chọn hành động tốt cho môi trường.', 'A. Trồng cây', 'B. Xả rác',
      'Đáp án: A', 'Đáp án:', '1.B'].map((line) => ({ tokens: [{ text: line }] })))
    expect(drafts[0].correctOptions).toEqual([])
    expect(drafts[0].warnings[0]).toMatch(/khác với bảng/)
    const warnings = duplicateWarnings(drafts, [{ id: 'a', text: 'Chọn hành động tốt cho môi trường!', answer: null }])
    expect(warnings.get(drafts[0].id)).toMatch(/^Trùng nội dung/)
    const near = duplicateWarnings(drafts, [{ id: 'b', text: 'Chọn hành động tốt cho môi trường sống.', answer: null }])
    expect(near.get(drafts[0].id)).toMatch(/gần giống/)
  })

  it('giữ danh sách đánh số trong câu có nhãn và đọc bảng đáp án trên một dòng', () => {
    const { drafts } = parseQuestions(['Câu 1: Trình bày hai bước.', '1. Đọc tài liệu', '2. Ghi chú',
      'Câu 2: Chọn màu.', 'a. Tím', 'b. Xanh', 'Bảng đáp án: 2.B'].map((line) => ({ tokens: [{ text: line }] })))
    expect(drafts).toHaveLength(2)
    expect(drafts[0].text).toBe('Trình bày hai bước.\n1. Đọc tài liệu\n2. Ghi chú')
    expect(drafts[1].options).toEqual(['Tím', 'Xanh'])
    expect(drafts[1].correctOptions).toEqual([1])
  })

  it('từ chối tệp lỗi và giới hạn dữ liệu giải nén vượt khai báo', async () => {
    await expect(importWord(readFixture('tep-loi'), vi.fn())).rejects.toThrow(/ZIP.*bị lỗi/)
    const bytes = readFixture('cau-hoi')
    const view = new DataView(bytes.buffer)
    let cursor = view.getUint32(bytes.length - 6, true)
    while (view.getUint32(cursor, true) === 0x02014b50) {
      const nameEnd = cursor + 46 + view.getUint16(cursor + 28, true)
      if (new TextDecoder().decode(bytes.subarray(cursor + 46, nameEnd)) === 'word/document.xml') {
        view.setUint32(cursor + 24, 1, true)
        break
      }
      cursor = nameEnd + view.getUint16(cursor + 30, true) + view.getUint16(cursor + 32, true)
    }
    await expect(importWord(bytes, vi.fn())).rejects.toThrow(/ZIP.*bị lỗi/)
  })
})
