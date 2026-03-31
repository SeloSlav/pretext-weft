import { useState } from 'react'
import { Demo } from './Demo'
import { Docs } from './Docs'
import { Editor } from './Editor'
import { Landing } from './Landing'
import { SceneryDemo } from './SceneryDemo'

type SitePage = 'home' | 'docs' | 'editor' | 'demo' | 'scenery'

export default function App() {
  const [page, setPage] = useState<SitePage>('home')

  return (
    <div className="site-root">
      <header className="site-nav">
        <div className="site-nav__brand">
          <button type="button" className="site-nav__logo" onClick={() => setPage('home')}>
            Weft
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
            className={`site-nav__link${page === 'docs' ? ' site-nav__link--active' : ''}`}
            onClick={() => setPage('docs')}
          >
            Docs
          </button>
          <button
            type="button"
            className={`site-nav__link${page === 'editor' ? ' site-nav__link--active' : ''}`}
            onClick={() => setPage('editor')}
          >
            Third person
          </button>
          <button
            type="button"
            className={`site-nav__link${page === 'scenery' ? ' site-nav__link--active' : ''}`}
            onClick={() => setPage('scenery')}
          >
            First person
          </button>
        </nav>

        <div className="site-nav__meta">
          <button
            type="button"
            className="btn btn--primary site-nav__cta"
            onClick={() => setPage('editor')}
          >
            Enter third person demo
          </button>
        </div>
      </header>

      <main className="site-main">
        {page === 'home' ? (
          <Landing onEnterEditor={() => setPage('editor')} />
        ) : page === 'docs' ? (
          <Docs onEnterEditor={() => setPage('editor')} />
        ) : page === 'demo' ? (
          <Demo />
        ) : page === 'scenery' ? (
          <SceneryDemo />
        ) : (
          <Editor />
        )}
      </main>
    </div>
  )
}
