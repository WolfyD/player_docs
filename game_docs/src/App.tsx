import './App.css'
import { ProjectSetup } from './components/ProjectSetup'
import { Editor } from './components/Editor'

function App() {
  const isEditor = location.hash.startsWith('#/editor/')
  return (
    <div className='App'>
      {isEditor ? <Editor /> : (
        <>
          <h1 style={{ margin: '-30px 0 30px' }}>PlayerDocs</h1>
          <ProjectSetup />
        </>
      )}
    </div>
  )
}

export default App