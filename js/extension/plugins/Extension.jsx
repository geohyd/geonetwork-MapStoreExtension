/* eslint-disable */
/* REQUIREMENTS */
import React from 'react';
import { connect } from 'react-redux';
import { name } from '../../../config';
import PropTypes from 'prop-types';
import {get, find} from 'lodash';
import { loadData, setMillesimeSelected, setParentSelected } from '../state/actions';
import geonetworkEpics from '../state/epics';
import geonetworkExtension from '../state/reducers';

import SideCard from '../components/SideCardM';
const {ListGroup, ListGroupItem, Glyphicon: GlyphiconRB, Button: ButtonRB} = require('react-bootstrap');
import tooltip from '@mapstore/components/misc/enhancers/tooltip';
const Button = tooltip(ButtonRB);
const { DropdownList } = require('react-widgets');

import {createSelector} from 'reselect';
import {layersSelector} from '@mapstore/selectors/layers';

import Message from "mapstore2/web/client/components/I18N/Message";

/* STYLE */
require('../assets/style.css');

/* SELECTORS */
const geonetworkSelector = createSelector(
    state => get(state, 'geonetworkExtension.text'),
    state => get(state, 'geonetworkExtension.style'),
    state => get(state, 'geonetworkExtension.parentSelected'),
    layersSelector,
    (text, style, parentSelected, layers) =>
        ({ text, style, parentSelected, layers: layers.filter(l => l.extendedParams && l.extendedParams.millesimeManagement)})
);

/* COMPONENT */
class GeoNetworkComponent extends React.Component {
    static propTypes = {
        text: PropTypes.string,
        colOrganisme: PropTypes.string,
        organismeFilter: PropTypes.object,
        millesimeLayers: PropTypes.bool,
        verbose: PropTypes.bool,
        translateAttributes: PropTypes.bool,
        multiChoicesEditor: PropTypes.bool,
        millesimeKeywords: PropTypes.array,
        onLoad: PropTypes.func,
        style: PropTypes.object,
        layers: PropTypes.array,
        onClickMillesime: PropTypes.func,
        parentSelected: PropTypes.object,
    };

    static defaultProps = {
        colOrganisme: 'organisme',
        organismeFilter: true,
        millesimeLayers: true,
        verbose: false,
        translateAttributes: true,
        multiChoicesEditor: true,
        style: {},
        layers: [],
        millesimeKeywords: ['millésime', 'millésimes', 'millesime', 'millesimes', 'mill�simes', 'mill�sime']
    };

    state = {
        millesimesListToggle: false
    };

    render() {
        // Should have a render but it can be not displayed
        return (<div className="ms2">
                    <div id="geonetworkCFG" style={{display: "none"}}
                        translateAttributes={this.props.translateAttributes.toString()}
                        multiChoicesEditor={this.props.multiChoicesEditor.toString()}
                        millesimeLayers={this.props.millesimeLayers.toString()}
                        millesimeKeywords={this.props.millesimeKeywords.toString()}
                        colOrganisme={this.props.colOrganisme}
                        verbose={this.props.verbose.toString()}
                        organismeFilter={this.props.organismeFilter.toString()} />
                    {this.props.millesimeLayers && this.props.layers.length > 0 ?
                        <div className="mapstore-side-card background-millesime-position" style={this.props.style}>
                            <div className="ms-header ms-primary container-fluid" style={{width: '100%'}}>
                                <div className="row bg-primary">
                                    <div className="col-xs-2">
                                        <div className="square-button bg-primary" style={{display: 'flex'}}>
                                            <span className="glyphicon glyphicon-tasks"></span>
                                        </div>
                                    </div>
                                    <div className="col-xs-10">
                                        <h4><span><Message msgId="millesimeManager.title" /></span></h4>
                                    </div>
                                </div>
                            </div>
                            <div className="dropdown-container">
                                <DropdownList
                                    placeholder={<Message msgId="millesimeManager.placeholder" />}
                                    value={this.props.parentSelected && this.props.parentSelected.title}
                                    onChange={(layer) => { this.props.onSelectParent(layer) }}
                                    data={this.props.layers}
                                    textField="title"
                                    valueField="id"
                                />
                            </div>
                            { this.props.parentSelected && <SideCard
                                dropUp={false}
                                style={{
                                    transform: 'unset',
                                    backgroundColor: '#ffffff',
                                    margin: 0
                                }}
                                tools={
                                    <Button className={`square-button-md${this.state.millesimesListToggle ? ' btn-success' : ' btn-primary'}`}
                                        onClick={() => this.setState({ millesimesListToggle: !this.state.millesimesListToggle })}
                                        tooltipId={<Message msgId="millesimeManager.millesimeSelection" />}
                                        tooltipPosition="bottom">
                                        <GlyphiconRB glyph={'list'}/>
                                    </Button>
                                }
                                description={
                                    this.props.parentSelected.extendedParams.millesimeManagement.currentMillesime && <div style={{margin: 0}}>
                                        <div style={{flex: 1, margin: 0}}>
                                            {find(this.props.parentSelected.extendedParams.millesimeManagement.layersList, {id: this.props.parentSelected.extendedParams.millesimeManagement.currentMillesime}).title.fre}
                                        </div>
                                        <div style={{
                                            flex: 2,
                                            margin: 0,
                                            alignItems: 'center'
                                        }}>
                                            <GlyphiconRB
                                                glyph="1-close glyph-btn"
                                                tooltipId={<Message msgId="millesimeManager.resetMillesime" />}
                                                tooltipPosition="bottom"
                                                onClick={() => this.props.onClickMillesime(this.props.parentSelected.id, null)}
                                                style={{
                                                    fontSize: 12
                                                }}/>
                                        </div>
                                    </div>
                                }
                                caption={this.props.parentSelected.extendedParams.millesimeManagement.currentMillesime ? "" : <Message msgId="millesimeManager.parentSelected" />}
                                body={
                                    <div>
                                        {this.state.millesimesListToggle &&
                                        <ListGroup
                                            style={{
                                                margin: 0,
                                                maxheight: 250
                                            }}>
                                            {this.props.parentSelected.extendedParams.millesimeManagement.layersList
                                                .map(millesime => (
                                                    <ListGroupItem
                                                        active={millesime.id === this.props.parentSelected.extendedParams.millesimeManagement.currentMillesime}>
                                                        <div className="row">
                                                            <div className="col-xs-10"
                                                                onClick={() => this.props.onClickMillesime(this.props.parentSelected.id, millesime.id)}>
                                                                <strong>{millesime.title.fre}</strong>
                                                            </div>
                                                        </div>
                                                    </ListGroupItem>
                                            ))}
                                        </ListGroup>}
                                    </div>
                                }
                                size="sm"
                                className="ms-date-filter"
                            />}
                        </div > : null}
                </div>);
    }
}

/* EXPORT PLUGIN */
export default {
    name,
    component: connect(geonetworkSelector,
        {
            onLoad: loadData,
            onClickMillesime: setMillesimeSelected,
            onSelectParent: setParentSelected
        }
    )(GeoNetworkComponent),
    reducers: { geonetworkExtension },
    epics: geonetworkEpics
};
