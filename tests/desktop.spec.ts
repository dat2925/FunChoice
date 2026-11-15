import { chromium, expect, test, type Browser, type Page } from '@playwright/test'
import { execFileSync, spawn, spawnSync, type ChildProcess } from 'node:child_process'
import { mkdtemp, rm, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { createServer } from 'node:net'
import { once } from 'node:events'

let browser: Browser | undefined
let app: ChildProcess | undefined
let data: string

function issue(machine: string, expiry = 'forever') {
  return execFileSync('python', ['scripts/funchoice-keygen.py', '--issue', expiry, '--machine', machine], {
    encoding: 'utf8', env: { ...process.env, FUNCHOICE_LEDGER_PATH: resolve(data, 'issued-machines.sqlite') },
  }).trim()
}

async function close() {
  if (app && app.exitCode === null) {
    const exited = once(app, 'exit')
    app.kill()
    await exited
  }
  if (browser) await browser.close().catch(() => undefined)
}

async function launch(): Promise<Page> {
  const socket = createServer()
  socket.listen(0, '127.0.0.1')
  await once(socket, 'listening')
  const address = socket.address()
  if (!address || typeof address === 'string') throw new Error('Không tìm được cổng kiểm thử.')
  const { port } = address
  await new Promise<void>((done, fail) => socket.close((error) => error ? fail(error) : done()))
  const exe = resolve('src-tauri/target/debug/FunChoice.exe')
  app = spawn(exe, {
    windowsHide: true, stdio: 'ignore',
    env: { ...process.env, SOLOTECH_TEST_DATA_DIR: data, WEBVIEW2_USER_DATA_FOLDER: resolve(data, "webview"), WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: '--remote-debugging-port=' + port },
  })
  let spawnError: Error | undefined
  app.on('error', (error) => { spawnError = error })
  await expect.poll(async () => {
    if (spawnError) throw spawnError
    return fetch('http://127.0.0.1:' + port + '/json/version').then((response) => response.ok).catch(() => false)
  }, { timeout: 15000 }).toBe(true)
  browser = await chromium.connectOverCDP('http://127.0.0.1:' + port)
  const context = browser.contexts()[0]
  const page = context.pages()[0] ?? await context.waitForEvent('page')
  await page.route(/https?:\/\//, (route) => {
    const host = new URL(route.request().url()).hostname
    return ['tauri.localhost', 'ipc.localhost'].includes(host) ? route.continue() : route.abort()
  })
  return page
}

test.afterEach(async () => {
  await close()
  if (data) await rm(data, { recursive: true, force: true, maxRetries: 6, retryDelay: 250 })
})

test('Windows: kích hoạt Pro từ thanh toán giả lập sau khi mở lại', async ({}) => {
  test.skip(process.env.FUNCHOICE_RUN_PAYMENT_E2E !== '1', 'Cần Worker mock và public key debug.')
  data = await mkdtemp(resolve(tmpdir(), 'solotech-payment-'))
  let page = await launch()
  await page.getByRole('button', { name: 'Nâng cấp Pro' }).click()
  await page.getByRole('button', { name: /Pro 1 năm/ }).click()
  await expect(page.getByLabel('Mã khôi phục đơn hàng')).toHaveValue(/^[0-9a-f-]{36}\.[0-9a-f]{64}$/)
  await expect(page.getByRole('button', { name: 'Mở trang thanh toán' })).toBeEnabled()
  const [id, token] = (await page.getByLabel('Mã khôi phục đơn hàng').inputValue()).split('.')
  const response = await fetch('http://127.0.0.1:8787/v1/orders/' + id, { headers: { Authorization: 'Bearer ' + token } })
  expect(response.ok).toBe(true)
  const { checkoutUrl } = await response.json() as { checkoutUrl: string }
  expect(checkoutUrl).toMatch(/^http:\/\/127\.0\.0\.1:8787\/mock\/checkout\//)
  await close()
  const payment = await fetch(checkoutUrl, { method: 'POST', redirect: 'manual' })
  expect(payment.status).toBe(303)
  page = await launch()
  await expect(page.locator('.license-status')).toContainText('Đến hết')
  await page.getByRole('button', { name: 'Nâng cấp Pro' }).click()
  await expect(page.getByLabel('Mã khôi phục đơn hàng')).toHaveValue(id + '.' + token)
})

test('Windows: nhập Excel, chơi với 99 học sinh, mở lại giữa lượt và đối chiếu lịch sử', async ({}, info) => {
  data = await mkdtemp(resolve(tmpdir(), 'solotech-e2e-'))
  let page = await launch()
  await expect(page.getByRole('heading', { name: 'FunChoice.' })).toBeVisible()
  await expect(page.locator('.sidebar').getByRole('img', { name: 'Logo SoloTech' })).toBeVisible()
  await expect(page.locator('.sidebar').getByText('Sản phẩm của SoloTech')).toBeVisible()
  await page.screenshot({ path: info.outputPath('truong-hoc.png') })
  await page.getByRole('button', { name: 'Thêm trường', exact: true }).first().click()
  await page.getByLabel('Tên trường').fill('Trường THPT Nguyễn Trãi')
  const theme = page.getByLabel('Nền sân trường')
  for (const [value, text] of [['rural', 'nông thôn'], ['mountain', 'miền núi'], ['city', 'thành phố']]) {
    await theme.selectOption(value)
    const preview = page.getByRole('img', { name: 'Xem trước sân trường ' + text })
    await expect(preview).toBeVisible()
    await preview.screenshot({ path: info.outputPath(value + '.png') })
  }
  await page.getByRole('dialog').getByRole('button', { name: 'Thêm trường' }).click()
  await page.getByRole('button', { name: 'Xem lớp học' }).click()
  await page.getByRole('button', { name: 'Thêm lớp', exact: true }).first().click()
  await page.getByLabel('Tên lớp').fill('Lớp 5A')
  await page.getByRole('dialog').getByRole('button', { name: 'Thêm lớp' }).click()
  await page.getByRole('button', { name: 'Xem học sinh' }).click()
  const command = <T>(name: string, args: Record<string, unknown> = {}) => page.evaluate(({name,args}) => {
    const core = (window as unknown as { __TAURI_INTERNALS__: { invoke: (command: string, args: Record<string, unknown>) => Promise<T> } }).__TAURI_INTERNALS__
    return core.invoke(name, args)
  }, {name,args})
  const classes = await command<{ id: string }[]>('list_classrooms', { schoolId: (await command<{id: string}[]>('list_schools'))[0].id })
  const classroomId = classes[0].id
  const roster = Array.from({ length: 31 }, (_, i) => ({ fullName: 'Kiểm thử ' + i, isActive: true }))
  await expect(command('import_students', { classroomId, students: roster })).rejects.toThrow(/30 học sinh/)
  const schoolId = (await command<{id: string}[]>('list_schools'))[0].id
  await command('save_classroom', { schoolId, name: 'Lớp thứ hai' })
  await expect(command('save_classroom', { schoolId, name: 'Lớp thứ ba' })).rejects.toThrow(/2 lớp/)
  await page.getByRole('button', { name: 'Nhập key Pro' }).click()
  await expect(page.getByRole('dialog')).toContainText('0944228546')
  await expect(page.getByRole('dialog')).toContainText('solotechvn.official@gmail.com')
  const machine = await page.getByLabel('Mã máy').inputValue()
  expect(machine).toMatch(/^FC-[0-9A-F]{32}$/)
  const wrongMachine = machine.slice(0, -1) + (machine.endsWith('0') ? '1' : '0')
  await page.getByLabel('Key Pro', { exact: true }).fill(issue(wrongMachine))
  await page.getByRole('button', { name: 'Kích hoạt Pro' }).click()
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText('Key không hợp lệ')
  const expiry = new Date(Date.now() + 86400000 * 7).toISOString().slice(0, 10)
  const timedKey = issue(machine, expiry)
  expect(issue(machine, expiry)).toBe(timedKey)
  const duplicate = spawnSync('python', ['scripts/funchoice-keygen.py', '--issue', 'forever', '--machine', machine], {
    encoding: 'utf8', env: { ...process.env, PYTHONIOENCODING: 'utf-8', FUNCHOICE_LEDGER_PATH: resolve(data, 'issued-machines.sqlite') },
  })
  expect(duplicate.status).toBe(1)
  expect(duplicate.stderr).toContain('đã có key còn hiệu lực')
  await page.getByLabel('Key Pro', { exact: true }).fill(timedKey)
  await page.getByRole('button', { name: 'Kích hoạt Pro' }).click()
  const proStatus = page.locator('.license-status')
  const [year, month, day] = expiry.split('-')
  await expect(proStatus).toContainText('Đến hết ' + day + '/' + month + '/' + year)
  await expect(page.getByRole('button', { name: /FunChoice Pro|Nhập key Pro/ })).toHaveCount(0)
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await page.reload()
  await expect(proStatus).toContainText('Đến hết ' + day + '/' + month + '/' + year)
  await page.getByRole('button', { name: 'Xem lớp học' }).click()
  await page.getByRole('article').filter({ hasText: 'Lớp 5A' }).getByRole('button', { name: 'Xem học sinh' }).click()
  await page.locator('input[type=file]').setInputFiles(resolve('tests/roster.xlsx'))
  await expect(page.getByRole('heading', { name: 'Nhập 100 học sinh' })).toBeVisible()
  await page.getByRole('button', { name: 'Nhập danh sách' }).click()
  await expect(page.getByText('99/100 học sinh đang hoạt động', { exact: false })).toBeVisible()
  await page.getByRole('button', { name: 'Cấu hình trò chơi' }).click()
  await page.getByRole('button', { name: 'Chọn Tiếp sức đấu đội' }).click()
  await expect(page.getByRole('button', { name: 'Bắt đầu tiếp sức' })).toBeDisabled()
  await page.getByRole('button', { name: 'Chuẩn bị câu hỏi' }).click()
  await page.locator('input[type=file]').setInputFiles(resolve('src/assets/Mau-cau-hoi-FunChoice.xlsx'))
  await expect(page.locator('.question-bank li')).toHaveCount(16)
  await page.getByRole('button', { name: 'Cấu hình trò chơi' }).click()
  await page.getByRole('button', { name: 'Chọn Tiếp sức đấu đội' }).click()
  await page.getByLabel('Tên đội 1').fill('Đội Sao')
  await page.getByLabel('Số vòng').fill('1')
  await page.getByRole('button', { name: 'Chia đều ngẫu nhiên' }).click()
  await page.getByRole('button', { name: 'Bắt đầu tiếp sức' }).click()
  const firstRelay = page.getByRole('region', { name: 'Câu hỏi lượt 1' })
  await expect(firstRelay.getByRole('heading')).toBeVisible()
  const firstRelayQuestion = await firstRelay.getByRole('heading').textContent()
  await page.getByRole('button', { name: 'Đúng · +1 điểm' }).click()
  const secondRelay = page.getByRole('region', { name: 'Câu hỏi lượt 2' })
  await expect(secondRelay.getByRole('heading')).toBeVisible()
  expect(await secondRelay.getByRole('heading').textContent()).not.toBe(firstRelayQuestion)
  await page.getByRole('button', { name: 'Sai / Bỏ qua' }).click()
  await expect(page.getByRole('heading', { name: 'Đội Sao chiến thắng!' })).toBeVisible()
  await page.getByRole('button', { name: 'Về cấu hình tiếp sức' }).click()
  await page.getByRole('button', { name: 'Chọn trò chơi', exact: true }).click()
  await page.getByRole('button', { name: 'Chi tiết lớp', exact: true }).click()
  const namesakes = page.getByRole('row').filter({ hasText: 'Nguyễn Minh Anh' })
  for (const [index, gender] of ['male', 'female'].entries()) {
    await namesakes.nth(index).getByRole('button', { name: 'Sửa Nguyễn Minh Anh' }).click()
    await expect(page.getByLabel('Mẫu chibi')).toHaveCount(0)
    await page.getByLabel('Giới tính').selectOption(gender)
    await page.getByRole('button', { name: 'Lưu thay đổi' }).click()
  }
  await expect(namesakes.nth(0).getByText('Nam', { exact: true })).toBeVisible()
  await expect(namesakes.nth(1).getByText('Nữ', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Cấu hình trò chơi' }).click()
  await page.getByRole('button', { name: 'Chọn Thiên thạch' }).click()
  await page.getByLabel('Chế độ chơi').selectOption('only')
  await page.getByLabel('Số học sinh được chọn').fill('5')
  await command('set_background_music', { path: resolve('tests/music.mp3') })
  await page.getByLabel('Nhạc nền').selectOption('mp3')
  await expect(page.getByLabel('Kiểu rơi thiên thạch')).toHaveValue('straight')
  await page.getByLabel('Kiểu rơi thiên thạch').selectOption('curve')
  await page.getByLabel('Kiểu rơi thiên thạch').selectOption({ label: 'Hỗn hợp' })
  await page.getByLabel('Chế độ chọn').selectOption('cycle')
  await page.getByLabel('Chạy trước lần rơi đầu').selectOption('6')
  await page.getByLabel('Khoảng cách giữa các lần rơi').selectOption('2')
  await page.getByLabel('Âm thanh').check()
  const audio = await page.evaluateHandle(() => {
    const create = AudioContext.prototype.createOscillator
    const createSource = AudioContext.prototype.createBufferSource
    const sample = { notes: 0, tracks: 0, shouts: 0 }
    AudioContext.prototype.createBufferSource = function () {
      const source = createSource.call(this)
      const start = source.start
      source.start = function (...args: Parameters<typeof start>) {
        if (source.loop) sample.tracks++
        else sample.shouts++
        return start.apply(source, args)
      }
      return source
    }
    AudioContext.prototype.createOscillator = function () {
      sample.notes++
      return create.call(this)
    }
    return sample
  })
  await page.getByLabel('Rung camera').uncheck()
  await page.getByRole('button', { name: 'BẮT ĐẦU TRÒ CHƠI' }).click()
  await expect(page.locator('.play-header').getByText('Trường THPT Nguyễn Trãi', { exact: true })).toBeVisible()
  await expect(page.locator('.play-footer').getByText('Sản phẩm của SoloTech', { exact: true })).toBeVisible()
  await expect(page.locator('.play-footer').getByRole('img', { name: 'Logo SoloTech' })).toBeVisible()
  await page.getByRole('button', { name: 'Toàn màn hình' }).click()
  await expect(page.locator('.play-header')).toBeHidden()
  await expect(page.locator('.play-footer')).toBeHidden()
  await expect.poll(() => page.locator('canvas').evaluate((canvas) => {
    const bounds = canvas.getBoundingClientRect()
    return Math.abs(bounds.width - window.innerWidth) <= 1
      && Math.abs(bounds.height - window.innerHeight) <= 1
      && Math.abs(bounds.left) <= 1 && Math.abs(bounds.top) <= 1
  })).toBe(true)
  await page.screenshot({ path: info.outputPath('toan-man-hinh.png') })
  await page.keyboard.press('Escape')
  await expect(page.locator('.play-header')).toBeVisible()
  await expect(page.locator('.game-stage')).toHaveAttribute('data-phase', 'RUNNING')
  await page.getByRole('button', { name: 'Thoát lượt' }).click()
  await expect(page.getByRole('heading', { name: 'Kết thúc lượt đang chơi?' })).toBeVisible()
  await page.waitForTimeout(650)
  await expect(page.locator('.play-header').getByText('Trường THPT Nguyễn Trãi', { exact: true })).toBeVisible()
  await expect(page.locator('.play-footer').getByText('Sản phẩm của SoloTech', { exact: true })).toBeVisible()
  await expect(page.locator('.play-footer').getByRole('img', { name: 'Logo SoloTech' })).toBeVisible()
  await expect(page.locator('.game-stage')).toHaveAttribute('data-phase', 'RUNNING')
  await page.getByRole('button', { name: 'Hủy', exact: true }).click()
  const sample = page.evaluate(() => new Promise<number>((resolve) => {
    let first = 0
    let frames = 0
    const frame = (time: number) => {
      first ||= time
      if (time - first >= 1000) resolve(Math.round(frames * 1000 / (time - first)))
      else { frames++; requestAnimationFrame(frame) }
    }
    requestAnimationFrame(frame)
  }))
  const first = await page.locator('canvas').screenshot({ timeout: 3000 })
  const second = await page.locator('canvas').screenshot({ timeout: 3000 })
  expect(first.equals(second)).toBe(false)
  await expect.poll(() => audio.evaluate((value) => value.tracks)).toBe(1)
  const fps = await sample
  expect(fps).toBeGreaterThan(15)
  await info.attach('Nhịp làm tươi WebView2 với 99 nhân vật', { body: String(fps) + ' FPS', contentType: 'text/plain' })
  console.log('Nhịp làm tươi WebView2 với 99 nhân vật: ' + fps + ' FPS')
  await page.screenshot({ path: info.outputPath('san-truong.png') })
  await page.waitForFunction(() => document.querySelector('.game-stage')?.getAttribute('data-phase') === 'METEOR_FALLING', null, { timeout: 7000 })
  expect(await audio.evaluate((value) => value.shouts)).toBe(0)
  await page.waitForTimeout(220)
  await page.screenshot({ path: info.outputPath('thien-thach.png') })
  await page.waitForFunction(() => ['MISS', 'IMPACT'].includes(document.querySelector('.game-stage')?.getAttribute('data-phase') ?? ''), null, { timeout: 7000 })
  if (await page.locator('.game-stage').getAttribute('data-phase') === 'MISS') {
    await expect(page.getByRole('progressbar')).toHaveAttribute('value', '0')
  }
  await page.waitForFunction(() => document.querySelector('.game-stage')?.getAttribute('data-phase') === 'IMPACT', null, { timeout: 8000 })
  await page.waitForTimeout(430)
  await page.screenshot({ path: info.outputPath('ngo-ngac.png') })
  await expect(page.getByRole('progressbar')).toHaveAttribute('value', '1')
  await close()

  page = await launch()
  await expect(page.locator('.license-status')).toContainText('Đến hết ' + day + '/' + month + '/' + year)
  const savedMedia = await page.evaluate(async () => {
    const { invoke } = (window as unknown as { __TAURI_INTERNALS__: {
      invoke: (name: string) => Promise<{ schoolTheme: string; settings: { meteorStyle: string } }>
    } }).__TAURI_INTERNALS__
    const pending = await invoke('pending_game')
    return { music: localStorage.getItem('funchoice.background-music'), theme: pending.schoolTheme, meteorStyle: pending.settings.meteorStyle }
  })
  expect(savedMedia.music).toBe('mp3')
  expect(savedMedia.theme).toBe('city')
  expect(savedMedia.meteorStyle).toBe('mixed')
  await page.getByRole('button', { name: 'Tiếp tục lượt' }).click()
  await expect(page.getByRole('progressbar')).toHaveAttribute('value', '1')
  await expect(page.getByRole('heading', { name: 'Kết quả chọn học sinh' })).toBeVisible({ timeout: 50000 })
  const selected = await page.locator('.result-list li').allTextContents()
  expect(selected).toHaveLength(5)
  const codes = await page.locator('.result-list li small').allTextContents()
  expect(new Set(codes).size).toBe(5)
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Xuất CSV' }).click()
  const file = await download
  expect(file.suggestedFilename()).toBe('ket-qua-thien-thach.csv')
  const path = await file.path()
  expect((await readFile(path, 'utf8')).split('\r\n')).toHaveLength(6)
  await page.getByRole('button', { name: 'Sao chép' }).click()
  await expect(page.getByText('Đã sao chép kết quả.')).toBeVisible()
  await page.getByRole('button', { name: 'Toàn màn hình' }).click()
  const isFullscreen = () => page.evaluate(async () => {
    const core = (window as unknown as { __TAURI_INTERNALS__: { invoke: (command: string) => Promise<boolean> } }).__TAURI_INTERNALS__
    return core.invoke('plugin:window|is_fullscreen')
  })
  await expect.poll(isFullscreen).toBe(true)
  await page.getByRole('button', { name: 'Toàn màn hình' }).click()
  await expect.poll(isFullscreen).toBe(false)
  await page.getByRole('button', { name: 'Quay lại' }).click()
  await page.getByRole('button', { name: 'Lịch sử chọn' }).click()
  await page.getByRole('button', { name: 'Xem kết quả' }).click()
  expect(await page.locator('.result-list li').allTextContents()).toEqual(selected)
  await expect(page.locator('.result-brand').getByRole('img', { name: 'Logo SoloTech' })).toBeVisible()
  await expect(page.locator('.result-brand').getByText('Sản phẩm của SoloTech')).toBeVisible()
  await page.screenshot({ path: info.outputPath('ket-qua.png') })
  await page.getByRole('button', { name: 'Quay lại' }).click()
  await page.getByRole('navigation', { name: 'Điều hướng chính' }).getByRole('button', { name: 'Trường học', exact: true }).click()
  await page.getByRole('button', { name: 'Xem lớp học' }).click()
  await page.getByRole('article').filter({ hasText: 'Lớp 5A' }).getByRole('button', { name: 'Xem học sinh' }).click()
  await page.getByRole('button', { name: 'Cấu hình trò chơi' }).click()
  await page.getByRole('button', { name: 'Chọn Thiên thạch' }).click()
  await expect(page.getByLabel('Nhạc nền')).toHaveValue('mp3')
  await page.getByRole('navigation', { name: 'Điều hướng chính' }).getByRole('button', { name: 'Trường học', exact: true }).click()
  await page.getByRole('button', { name: 'Sửa Trường THPT Nguyễn Trãi' }).click()
  await expect(page.getByLabel('Nền sân trường')).toHaveValue('city')
  await page.getByLabel('Nền sân trường').selectOption('mountain')
  await page.getByRole('button', { name: 'Lưu thay đổi' }).click()
  await expect(page.getByRole('article').filter({ hasText: 'Trường THPT Nguyễn Trãi' })).toContainText('Miền núi')
})

test('Windows: câu hỏi theo lượt, tiếp tục sau khi mở lại và chọn lặp', async ({}, info) => {
  data = await mkdtemp(resolve(tmpdir(), 'solotech-questions-'))
  let page = await launch()
  await page.getByRole('button', { name: 'Nhập key Pro' }).click()
  await page.getByLabel('Key Pro', { exact: true }).fill(issue(await page.getByLabel('Mã máy').inputValue()))
  await page.getByRole('button', { name: 'Kích hoạt Pro' }).click()
  await expect(page.locator('.license-status')).toContainText('Vĩnh viễn')
  await page.getByRole('button', { name: 'Thêm trường', exact: true }).first().click()
  await page.getByLabel('Tên trường').fill('Trường Câu Hỏi')
  await page.getByRole('dialog').getByRole('button', { name: 'Thêm trường' }).click()
  await page.getByRole('button', { name: 'Xem lớp học' }).click()
  await page.getByRole('button', { name: 'Thêm lớp', exact: true }).first().click()
  await page.getByLabel('Tên lớp').fill('Lớp câu hỏi')
  await page.getByRole('dialog').getByRole('button', { name: 'Thêm lớp' }).click()
  await page.getByRole('article').filter({ hasText: 'Lớp câu hỏi' }).getByRole('button', { name: 'Xem học sinh' }).click()
  await page.getByRole('button', { name: 'Thêm học sinh', exact: true }).first().click()
  await page.getByLabel('Họ và tên').fill('Minh An')
  await page.getByRole('dialog').getByRole('button', { name: 'Thêm học sinh' }).click()
  await page.getByRole('button', { name: 'Chuẩn bị câu hỏi', exact: true }).click()
  await page.getByLabel('Câu hỏi', { exact: true }).fill('2 + 3 bằng bao nhiêu?')
  await page.getByLabel('Đáp án (không bắt buộc)').fill('Bằng 5')
  await page.getByRole('button', { name: 'Thêm câu hỏi' }).click()
  await expect(page.getByRole('button', { name: '2 + 3 bằng bao nhiêu?', exact: true })).toBeVisible()
  await page.locator('input[type=file]').setInputFiles({
    name: 'cau-hoi.csv', mimeType: 'text/csv', buffer: Buffer.from('Câu hỏi,Đáp án,A,B,C,Đáp án đúng\nSố nào là số chẵn?,,2,3,4,A C'),
  })
  await expect(page.getByRole('button', { name: 'Số nào là số chẵn?', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Số nào là số chẵn?', exact: true }).click()
  await expect(page.getByLabel('Loại câu hỏi')).toHaveValue('choice')
  await expect(page.getByLabel('Số phương án')).toHaveValue('3')
  await page.getByLabel('Số phương án').selectOption('4')
  await page.getByLabel('Phương án D').fill('7')
  await page.getByRole('button', { name: 'Lưu sửa đổi' }).click()
  await page.getByLabel('Số lượt dự kiến').fill('2')
  await page.getByLabel('Lượt 1', { exact: true }).selectOption({ label: '2 + 3 bằng bao nhiêu?' })
  await expect(page.getByLabel('Lượt 2', { exact: true })).toHaveValue('')
  await page.getByRole('button', { name: 'Cấu hình trò chơi' }).click()
  await page.getByRole('button', { name: 'Chọn Thiên thạch' }).click()
  await page.getByLabel('Cho phép chọn lại học sinh').check()
  await page.getByLabel('Chạy trước lần rơi đầu').selectOption('0')
  await page.getByLabel('Tốc độ trò chơi').selectOption('2')
  await page.getByRole('button', { name: 'BẮT ĐẦU TRÒ CHƠI' }).click()
  await expect(page.getByRole('heading', { name: '2 + 3 bằng bao nhiêu?' })).toBeVisible({ timeout: 12000 })
  await expect(page.locator('.question-answer')).toBeHidden()
  await page.getByRole('button', { name: 'Hiện đáp án' }).click()
  await expect(page.locator('.question-answer')).toContainText('Bằng 5')
  await page.screenshot({ path: info.outputPath('cau-hoi.png') })
  await close()
  page = await launch()
  await page.getByRole('button', { name: 'Tiếp tục lượt' }).click()
  await expect(page.getByRole('heading', { name: '2 + 3 bằng bao nhiêu?' })).toBeVisible({ timeout: 12000 })
  await page.getByRole('button', { name: 'Tiếp tục', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Số nào là số chẵn?' })).toBeVisible({ timeout: 12000 })
  const options = page.getByRole('group', { name: 'Các phương án' })
  await expect(options.getByRole('button')).toHaveCount(4)
  const first = options.getByRole('button', { name: 'A 2' })
  const third = options.getByRole('button', { name: 'C 4' })
  await first.click()
  await third.click()
  await expect(first).toHaveAttribute('aria-pressed', 'true')
  await expect(third).toHaveAttribute('aria-pressed', 'true')
  await expect(options.getByText('Đúng', { exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: 'Hiện đáp án' }).click()
  await expect(options.getByText('Đúng', { exact: true })).toHaveCount(2)
  await page.screenshot({ path: info.outputPath('trac-nghiem.png') })
  await page.getByRole('button', { name: 'Xem kết quả' }).click()
  await expect(page.locator('.result-list li strong')).toHaveText(['Minh An', 'Minh An'])
})





