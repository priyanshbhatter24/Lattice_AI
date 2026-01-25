import { useState, useCallback } from 'react'
import { useDropzone } from 'react-dropzone'
import { useStore } from '../store'
import { Upload, FileText, Loader2 } from 'lucide-react'

export function ScriptUpload() {
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const { uploadScript, isLoading, error } = useStore()

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const file = acceptedFiles[0]
    if (file) {
      setTitle(file.name.replace(/\.[^/.]+$/, ''))
      const reader = new FileReader()
      reader.onload = () => {
        setContent(reader.result as string)
      }
      reader.readAsText(file)
    }
  }, [])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'text/plain': ['.txt'],
      'application/pdf': ['.pdf'],
    },
    maxFiles: 1,
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title || !content) return
    await uploadScript(title, content)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Dropzone */}
      <div
        {...getRootProps()}
        className={`
          border-2 border-dashed rounded-lg p-12 text-center cursor-pointer
          transition-colors
          ${isDragActive ? 'border-primary bg-primary/5' : 'border-gray-300 hover:border-gray-400'}
        `}
      >
        <input {...getInputProps()} />
        <Upload className="h-12 w-12 mx-auto text-gray-400 mb-4" />
        {isDragActive ? (
          <p className="text-primary">Drop your script here...</p>
        ) : (
          <div>
            <p className="text-gray-600 mb-1">
              Drag and drop your script file here, or click to browse
            </p>
            <p className="text-sm text-gray-400">Supports .txt and .pdf files</p>
          </div>
        )}
      </div>

      {/* Title Input */}
      <div>
        <label htmlFor="title" className="block text-sm font-medium text-gray-700 mb-1">
          Script Title
        </label>
        <input
          type="text"
          id="title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Enter script title"
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
        />
      </div>

      {/* Content Textarea */}
      <div>
        <label htmlFor="content" className="block text-sm font-medium text-gray-700 mb-1">
          Script Content
        </label>
        <textarea
          id="content"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Paste your screenplay here..."
          rows={12}
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent font-mono text-sm"
        />
      </div>

      {/* Error Message */}
      {error && (
        <div className="bg-red-50 text-red-600 px-4 py-2 rounded-lg text-sm">
          {error}
        </div>
      )}

      {/* Submit Button */}
      <button
        type="submit"
        disabled={!title || !content || isLoading}
        className={`
          w-full py-3 px-4 rounded-lg font-medium flex items-center justify-center gap-2
          ${
            !title || !content || isLoading
              ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
              : 'bg-primary text-white hover:bg-primary/90'
          }
        `}
      >
        {isLoading ? (
          <>
            <Loader2 className="h-5 w-5 animate-spin" />
            Analyzing Script...
          </>
        ) : (
          <>
            <FileText className="h-5 w-5" />
            Upload & Extract Scenes
          </>
        )}
      </button>
    </form>
  )
}
