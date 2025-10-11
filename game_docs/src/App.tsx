import './App.css'
import { useEffect, useState } from 'react'
import { ProjectSetup } from './components/ProjectSetup'
import { Editor } from './components/Editor'
import PlaceMap from '@/components/PlaceMap'

function App() {
  const [hash, setHash] = useState<string>(location.hash)
  useEffect(() => {
    const onHash = () => setHash(location.hash)
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])
  const isEditor = hash.startsWith('#/editor/')
  const isMap = hash.startsWith('#/map')
  return (
    <div className='App'>
      {isEditor ? <Editor /> : isMap ? (
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