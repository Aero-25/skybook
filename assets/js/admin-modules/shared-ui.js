(function(){
  const root=window.SkyBookAdminModules=window.SkyBookAdminModules||{}

  const renderWorkflowFields=(fields,helpers={})=>{
    const escapeHtml=typeof helpers.escapeHtml==='function' ? helpers.escapeHtml : value=>String(value ?? '')
    const htmlAttribute=typeof helpers.htmlAttribute==='function' ? helpers.htmlAttribute : value=>String(value ?? '')
    return (Array.isArray(fields) ? fields : []).map(field=>{
      const name=htmlAttribute(field?.name||'field')
      const label=escapeHtml(field?.label||'Field')
      const required=field?.required ? 'required' : ''
      const helper=field?.helper ? `<small class="field-hint">${escapeHtml(field.helper)}</small>` : ''
      if(field?.type==='textarea'){
        return `
          <label class="booking-field-full">
            <span>${label}</span>
            <textarea name="${name}" rows="${htmlAttribute(field.rows||4)}" placeholder="${htmlAttribute(field.placeholder||'')}" ${required}>${escapeHtml(field.value||'')}</textarea>
            ${helper}
          </label>
        `
      }
      if(field?.type==='select'){
        return `
          <label class="booking-field${field.fullWidth ? '-full' : ''}">
            <span>${label}</span>
            <select name="${name}" ${required}>
              ${(field.options||[]).map(option=>`<option value="${htmlAttribute(option.value)}" ${String(option.value)===String(field.value) ? 'selected' : ''}>${escapeHtml(option.label||option.value)}</option>`).join('')}
            </select>
            ${helper}
          </label>
        `
      }
      if(field?.type==='checkbox'){
        return `
          <label class="booking-field-full inline-check">
            <input type="checkbox" name="${name}" ${field.checked ? 'checked' : ''}>
            <span>${label}</span>
          </label>
        `
      }
      return `
        <label class="booking-field${field?.fullWidth ? '-full' : ''}">
          <span>${label}</span>
          <input
            name="${name}"
            type="${htmlAttribute(field?.type||'text')}"
            value="${htmlAttribute(field?.value||'')}"
            placeholder="${htmlAttribute(field?.placeholder||'')}"
            ${field?.min!==undefined ? `min="${htmlAttribute(field.min)}"` : ''}
            ${field?.max!==undefined ? `max="${htmlAttribute(field.max)}"` : ''}
            ${field?.step!==undefined ? `step="${htmlAttribute(field.step)}"` : ''}
            ${field?.pattern ? `pattern="${htmlAttribute(field.pattern)}"` : ''}
            ${required}
          >
          ${helper}
        </label>
      `
    }).join('')
  }

  root.sharedUi={ renderWorkflowFields }
})()
