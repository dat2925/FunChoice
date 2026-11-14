import { describe, expect, it } from 'vitest'
import { readFile } from 'node:fs/promises'
import { readRoster } from '../src/roster'

describe('nhập danh sách', () => {
  it('đọc 100 học sinh trong Excel, giữ mã dạng văn bản và tên trùng', async () => {
    const data = await readFile(new URL('./roster.xlsx', import.meta.url))
    const roster = await readRoster(new File([new Uint8Array(data)], 'roster.xlsx'))
    expect(roster).toHaveLength(100)
    expect(roster[0]).toEqual({ fullName: 'Nguyễn Minh Anh', studentCode: '001', isActive: true })
    expect(roster[1].fullName).toBe(roster[0].fullName)
    expect(roster[99].isActive).toBe(false)
  })

  it('đọc CSV UTF-8 và báo lỗi khi thiếu tên', async () => {
    const file = new File(['\ufeffHọ và tên,Mã học sinh,Trạng thái\n"Nguyễn, An",009,Tạm dừng'], 'class.csv')
    await expect(readRoster(file)).resolves.toEqual([{ fullName: 'Nguyễn, An', studentCode: '009', isActive: false }])
    await expect(readRoster(new File(['Họ và tên,Mã học sinh\n,3'], 'bad.csv'))).rejects.toThrow(/dòng 2/)
  })
  it('đọc cột giới tính Nam và Nữ trong CSV', async () => {
    const file = new File(['Họ và tên,Giới tính\nNguyễn Minh Anh,Nam\nNguyễn Minh Anh,Nữ'], 'class.csv')
    const roster = await readRoster(file)
    expect(roster.map((student) => student.gender)).toEqual(['male', 'female'])
  })

})
