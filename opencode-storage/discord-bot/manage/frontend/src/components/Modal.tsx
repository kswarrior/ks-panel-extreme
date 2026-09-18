import React from 'react'

type Props = {
  open: boolean
  title: string
  children: React.ReactNode
  onClose: () => void
  footer?: React.ReactNode
  width?: number
}
export function Modal({ open, title, children, onClose, footer, width=520 }: Props){
  if(!open) return null
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" style={{ maxWidth: width }} onClick={e=>e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">{title}</div>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>
  )
}

type ConfirmProps = {
  open: boolean
  title?: string
  message: string
  confirmText?: string
  cancelText?: string
  danger?: boolean
  onConfirm: () => void
  onCancel: () => void
}
export function Confirm({ open, title="Are you sure?", message, confirmText="Confirm", cancelText="Cancel", danger=false, onConfirm, onCancel }: ConfirmProps){
  if(!open) return null
  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" style={{maxWidth:420}} onClick={e=>e.stopPropagation()}>
        <div className="modal-header"><div className="modal-title">{title}</div><button className="modal-close" onClick={onCancel}>✕</button></div>
        <div className="modal-body"><div style={{color:'var(--text-muted)', fontSize:13, lineHeight:1.6}}>{message}</div></div>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onCancel}>{cancelText}</button>
          <button className={`btn ${danger ? 'btn-danger':'btn-primary'}`} onClick={onConfirm}>{confirmText}</button>
        </div>
      </div>
    </div>
  )
}
