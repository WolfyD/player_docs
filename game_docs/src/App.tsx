import './App.css'
import { useEffect, useState } from 'react'
import { ProjectSetup } from './components/ProjectSetup'
import { Editor } from './components/Editor'
import PlaceMap from '@/components/PlaceMap'
import EditorNext from './components/EditorNext'

function App() {
  const [hash, setHash] = useState<string>(location.hash)
  useEffect(() => {
    const onHash = () => setHash(location.hash)
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])
  const isEditor = hash.startsWith('#/editor/')
  const isEditorNext = hash.startsWith('#/editor-next/')
  const isMap = hash.startsWith('#/map')
  return (
    <div className='App'>
      {isEditor ? <Editor /> : isEditorNext ? <EditorNext /> : isMap ? (
        <PlaceMap />
      ) : (
        <>
          
          <ProjectSetup />
        </>
      )}
    </div>
  )
}

export default App