import { useState } from 'react'
import { Editor } from './Editor'
import { Landing } from './Landing'

type SitePage = 'home' | 'editor'

export default function App() {
  const [page, setPage] = useState<SitePage>('home')

  return (
    <div className="site-root">
      <header className="site-nav">
        <div className="site-nav__brand">
          <button type="button" className="site-nav__logo" onClick={() => setPage('home')}>
            Pretext Weft
          </button>
        </div>

        <nav className="site-nav__links" aria-label="Site">
          <button
            type="button"
            className={`site-nav__link${page === 'home' ? ' site-nav__link--active' : ''}`}
            onClick={() => setPage('home')}
          >
            Overview
          </button>
          <button
            type="button"
            className={`site-nav__link${page === 'editor' ? ' site-nav__link--active' : ''}`}
            onClick={() => setPage('editor')}
          >
            Playground
          </button>
        </nav>

        <div className="site-nav__meta">
          <a
            className="site-nav__external"
            href="https://www.npmjs.com/package/@chenglou/pretext"
            target="_blank"
            rel="noreferrer"
          >
            Pretext
          </a>
        </div>
      </header>

      <main className="site-main">{page === 'home' ? <Landing onEnterEditor={() => setPage('editor')} /> : <Editor />}</main>
    </div>
  )
}
