import React, { Fragment, useRef, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faChevronUp, faChevronDown } from '@fortawesome/free-solid-svg-icons';
import classnames from 'classnames';
import styles from './Tile.module.scss';
import icons from './icons';

const getUrl = (url) => url.replace('../', '');

const recursiveRender = (items, framework, group, collapsed, level = 0, isLast, forceTopLevel) => items.map((item, idx) => {
    if (item.frameworks && item.frameworks.indexOf(framework) === - 1) { return null; }

    const className = `menu-view-tile__list__${level === 0 || forceTopLevel ? 'block' : 'inline'}`;
    const hideComma = level === 0 || forceTopLevel;

    const title = item.url && (!collapsed || item.showInCollapsed) && (
        <span className={ styles[className]}>
            <a href={ getUrl(item.url) }>{ item.title }{ item.enterprise && <enterprise-icon/> }</a>
            { !hideComma && <span className={ styles['menu-view-tile__item-split'] } style={{ marginRight: 2 }}>,</span> }
        </span>
     )

     let content = null;
     const nextItems = item.items;

     if (nextItems && nextItems.length) {
        content = recursiveRender(
            nextItems,
            framework,
            item.title.replace(/\s/g,'_').toLowerCase(),
            collapsed, 
            level + 1,
            level === 0 || (isLast && idx === items.length - 1),
            !!item.forceTopLevelSubItems
        )
        if (level === 0) {
            content = (
                <div className={ classnames(styles['menu-view-tile__sub_list'], { [styles['menu-view-tile--force_toplevel']]: !!item.forceTopLevelSubItems }) }>
                    { content }
                </div>
            )
        }
     }

    if (!title && !content) { return null; }

    return (
        <Fragment key={`${group}_${item.title.replace(/\s/g,'_').toLowerCase()}`}>
            { title }
            { content }
        </Fragment>
    )
});

const Tile = ({ data, group, framework }) => {
    const tileEl = useRef(null);
    const [collapsed, setCollapsed] = useState(true);

    if (!data.icon) { return null; }
    const iconName = data.icon.replace('icon-','');
    const iconAlt= iconName.replace(/-/g,' ');

    const toggleCollapse = (shouldCollapse) => {
        if (typeof shouldCollapse !== 'boolean') {
            shouldCollapse = !collapsed;
        }

        if (document.body.clientWidth < 768) {
            setCollapsed(shouldCollapse);
        }
    }

    const onClick = () => {
        toggleCollapse();

    }

    const onKeyDown = (e) => {
        const key = e.key;
        const wrapperFocused = tileEl.current === document.activeElement;
        if (key !== 'Enter' && key !== ' ') { return; }

        if (key === ' ' || wrapperFocused) {
            e.preventDefault();
            toggleCollapse();
        }
    }

    const onMouseOut = () => {
        toggleCollapse(true);
    }

    const onBlur = (e) => {
        if (tileEl.current && tileEl.current.contains(e.relatedTarget)) { return; }
        toggleCollapse(true);
    }

    return (
        <div 
            ref={ tileEl }
            className={ classnames(styles['menu-view-tile'], { [styles['menu-view-tile--collapsed']]: collapsed }) }
            role="button"
            tabIndex={0}
            aria-expanded={!collapsed}
            onClick={ () => onClick() }
            onKeyDown={ (e) => onKeyDown(e) }
            onMouseLeave={ () => onMouseOut() }
            onBlur={(e) => onBlur(e) }>
            <div className={ styles['menu-view-tile__icon'] }><img alt={ iconAlt } src={ icons[iconName] }></img></div>
            <h3 className={ styles['menu-view-tile__title'] }>{ data.title }</h3>
            <div className={ styles['menu-view-tile__list'] }>
                { recursiveRender(data.items, framework, group, collapsed) }
            </div>
            <FontAwesomeIcon icon={collapsed ? faChevronDown : faChevronUp } fixedWidth className={styles['menu-view-tile__expander']} />
        </div>
    )
}

export default Tile;