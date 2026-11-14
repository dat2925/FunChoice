import Phaser from 'phaser'
import { useEffect, useRef } from 'react'
import type { Session, Student } from '../api'
import { Yard, type SceneEvents } from './scene'
import { fieldHeight, fieldWidth } from './yard'

export default function GameCanvas({ session, students, events, audio, paused }: {
  session: Session; students: Student[]; events: SceneEvents; audio?: AudioContext; paused: boolean
}) {
  const host = useRef<HTMLDivElement>(null)
  const activeScene = useRef<Yard>(null)
  const isPaused = useRef(paused)
  isPaused.current = paused
  useEffect(() => {
    if (!host.current) return
    const scene = new Yard(students, session, events, audio)
    activeScene.current = scene
    scene.hold(isPaused.current)
    const game = new Phaser.Game({
      parent: host.current, type: Phaser.AUTO, width: fieldWidth, height: fieldHeight,
      scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
      backgroundColor: '#201644', render: { antialias: true },
      physics: { default: 'arcade', arcade: { gravity: { x: 0, y: 0 } } },
      scene,
      audio: { noAudio: true }, fps: { target: 60 },
    })
    return () => game.destroy(true)
  }, [session, students, events, audio])
  useEffect(() => { activeScene.current?.hold(paused) }, [paused])
  return <div className="game-canvas" ref={host} role="img" aria-label="Sân trường với các nhân vật học sinh chibi" />
}

