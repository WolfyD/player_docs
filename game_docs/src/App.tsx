import './App.css'
import { ProjectSetup } from './components/ProjectSetup'
import { Editor } from './components/Editor'

function App() {
  const isEditor = location.hash.startsWith('#/editor/')
  return (
    <div className='App'>
      {isEditor ? <Editor /> : (
        <>
          
          <ProjectSetup />
        </>
      )}
    </div>
  )
}

export default App